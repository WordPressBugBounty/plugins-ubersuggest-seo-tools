<?php
defined( 'ABSPATH' ) || exit;

/**
 * UBS backend API client.
 *
 * All knowledge of the backend's API contract (base URL, endpoint paths,
 * auth header, request/response shapes) lives in this class. When the
 * Site Audit contract is confirmed, this should be the only file that
 * changes.
 */
class UBS_SEO_Api_Client {

    private string $base_url;
    private string $api_key;

    /**
     * Every credential failure a call can end in, mapped to whether the account
     * was ONCE connected. Sources: {@see self::bearer_token()} (no credentials
     * at all) and UBS_SEO_OAuth_Client's token refresh.
     */
    public const AUTH_ERROR_EXPIRED = [
        'ubs_seo_no_auth'       => false,
        'ubs_seo_not_connected' => false,
        'ubs_seo_no_refresh'    => true,
        'ubs_seo_token_error'   => true,
    ];

    /**
     * Auth failure seen this PHP request, for callers that would otherwise
     * recover from it and hide a dead account. Only codes from
     * {@see self::AUTH_ERROR_EXPIRED} are recorded — a transport blip during
     * refresh is not a dead account — and any later call that resolves a token
     * clears it, so the LAST auth outcome wins.
     */
    private static ?WP_Error $last_auth_error = null;

    public static function last_auth_error(): ?WP_Error {
        return self::$last_auth_error;
    }

    public function __construct() {
        $options = get_option( UBS_SEO_OPTION_KEY, [] );
        // The backend host comes from the constant, never the stored option —
        // see UBS_SEO_DEFAULT_BASE_URL for why. api_key stays per-install: it
        // is a credential, not infra config.
        $this->base_url = untrailingslashit( UBS_SEO_DEFAULT_BASE_URL );
        $this->api_key  = isset( $options['api_key'] ) ? (string) $options['api_key'] : '';
    }

    /**
     * Trigger a Site Audit for the given domain.
     *
     * Maps to backend: GET /api/site_audit?domain=<domain>[&path=<path>]
     * Returns HTTP 204 with an empty body on success.
     *
     * @param string|null $path Crawl only this one page instead of the whole
     *                          site. There is no separate single-page endpoint:
     *                          passing `path` switches this same call into URL
     *                          mode, and the backend then crawls the 8 scheme /
     *                          www / trailing-slash variants of `domain + path`
     *                          and keeps the best one. The report it writes is
     *                          keyed `<domain><path>` — a SEPARATE report from
     *                          the domain's, so a page crawl never touches the
     *                          site-wide score. Status and breakdown reads must
     *                          carry the same `path` to find it.
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function trigger_site_audit( string $domain, ?string $path = null ) {
        // `recrawl=true` forces a fresh full crawl; without it the backend just
        // returns the last report instead of re-crawling. Subject to the backend's
        // own rules: needs an active subscription and is rate-limited to once/min.
        // The trigger endpoint requires a `ts` header (a per-request id; backend
        // convention is a unix timestamp). The status endpoint does not.
        return $this->request(
            'GET',
            '/api/site_audit',
            $this->audit_query( $domain, $path ) + [ 'recrawl' => 'true' ],
            [],
            [ 'ts' => (string) time() ]
        );
    }

    /**
     * Stop the crawl currently running for $domain.
     *
     * Maps to backend: POST /api/stop_site_audit { domain[, path] }. Answers
     * HTTP 204 once it has stopped the crawler task and dropped the pending
     * record, or 400 "Task has not been set" when there was no crawl to stop —
     * which {@see UBS_SEO_Audit_Service::cancel_audit()} reads as success.
     *
     * The target must be described exactly as {@see self::trigger_site_audit()}
     * described it: both sides key the pending task by `path` applied to
     * `domain` (the backend's `get_single_url(domain, path) or domain`), so a
     * stop that omits a `path` the trigger sent looks up a key that does not
     * exist — and the crawl keeps running behind a 400 that reads as success.
     * Hence `$path` here, and the shared {@see self::audit_query()}.
     *
     * @param ?string $path Page-level crawl to stop, as passed to the trigger.
     *                      Null (the default) stops the whole-site crawl.
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function stop_site_audit( string $domain, ?string $path = null ) {
        return $this->request( 'POST', '/api/stop_site_audit', [], $this->audit_query( $domain, $path ) );
    }

    /**
     * Fetch current Site Audit status / report for a domain, or for a single
     * page when `$path` is set (see trigger_site_audit).
     *
     * Maps to backend: GET /api/site_audit_status?domain=<domain>[&path=<path>]
     * Returns HTTP 200 with { result: { done, crawl_count, crawl_max_pages, report } }.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function get_site_audit_status( string $domain, ?string $path = null ) {
        return $this->request( 'GET', '/api/site_audit_status', $this->audit_query( $domain, $path ) );
    }

    /**
     * Query args shared by the audit trigger / status / breakdown calls. `path`
     * is omitted entirely when null — sending it empty would put the backend in
     * URL mode against the domain root instead of the whole site.
     */
    private function audit_query( string $domain, ?string $path ): array {
        $query = [ 'domain' => $domain ];
        if ( $path !== null && $path !== '' ) {
            $query['path'] = $path;
        }
        return $query;
    }

    /**
     * Pages the audit flagged for a single issue (the "SEO Issues Details" data).
     * Works for any issue type. Body: { breakdown: [ { url, ... }, ... ] }.
     *
     * Maps to backend: GET /api/site_audit_breakdown?domain=<domain>&issue=<id>[&path=<path>]
     *
     * @param string|null $path Read the breakdown of a single page's own report
     *                          rather than the domain's (see trigger_site_audit).
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function get_site_audit_breakdown( string $domain, string $issue_id, ?string $path = null ) {
        return $this->request(
            'GET',
            '/api/site_audit_breakdown',
            $this->audit_query( $domain, $path ) + [ 'issue' => $issue_id ]
        );
    }

    /**
     * Fetch Core Web Vitals (Site Speed) for a domain, both devices at once.
     * Async on the backend: the first call triggers the audit and returns pending
     * modes; poll until the top-level `done` is true. Scope `site_audit`; the
     * backend charges no credits for it.
     *
     * Maps to backend: GET /api/pagespeed_audit?domain=<d>&devices=DESKTOP,MOBILE
     * Body: { done: bool, report: { DESKTOP: {...}, MOBILE: {...} } }.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function get_pagespeed_audit( string $domain, bool $force = false ) {
        $query = [ 'domain' => $domain, 'devices' => 'DESKTOP,MOBILE' ];
        if ( $force ) {
            $query['forceUpdate'] = 'true';
        }
        return $this->request( 'GET', '/api/pagespeed_audit', $query );
    }

    /**
     * Domain-level SEO metrics: last-month organic traffic (`traffic`), organic
     * keyword count (`organic`) and backlinks (`backlinks`) in one response.
     * withKeywords=false skips the (heavy, unneeded) per-keyword list — the
     * counts come regardless. Scope `domain`; counts against the account's
     * report limit, so callers must cache.
     *
     * Maps to backend: GET /api/domain_overview?domain=<d>&language=en&withKeywords=false
     * Body: { domain, organic, traffic, backlinks, ... } or { noData: true }.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function get_domain_overview( string $domain, string $language = 'en' ) {
        return $this->request(
            'GET',
            '/api/domain_overview',
            [
                'domain'       => $domain,
                'language'     => $language,
                'withKeywords' => 'false',
            ],
            [],
            // The reports-limit gate requires a `ts` header as the report id
            // (the web app sends a ms timestamp); same id = same report, so a
            // retry doesn't double-charge.
            [ 'ts' => (string) round( microtime( true ) * 1000 ) ]
        );
    }

    /**
     * List the connected account's projects.
     *
     * Maps to backend: GET /api/projects -> { projects: [ { id, domain, ... } ] }
     * Requires the `projects` OAuth scope.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function get_projects() {
        return $this->request( 'GET', '/api/projects' );
    }

    /**
     * The connected account's profile + subscription summary (scope `profile`).
     * Body carries subscription: null unless a subscription is ACTIVE.
     *
     * Maps to backend: GET /api/oauth2/userinfo
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function get_user_info() {
        return $this->request( 'GET', '/api/oauth2/userinfo' );
    }

    /**
     * Find the project id whose domain matches $domain (www-insensitive), or
     * null if the account has no project for it. Returns WP_Error on transport
     * or auth failure (e.g. the `projects` scope was not granted).
     *
     * @return string|null|WP_Error
     */
    public function find_project_id( string $domain ) {
        $response = $this->get_projects();
        if ( is_wp_error( $response ) ) {
            return $response;
        }
        if ( (int) $response['status'] !== 200 || ! is_array( $response['body'] ) ) {
            return new WP_Error( 'ubs_seo_projects_http', sprintf( 'Projects request failed (HTTP %d).', (int) $response['status'] ) );
        }
        $projects = isset( $response['body']['projects'] ) && is_array( $response['body']['projects'] )
            ? $response['body']['projects']
            : [];
        $wanted_domain = $this->bare_domain( $domain );
        foreach ( $projects as $project ) {
            if ( is_array( $project ) && isset( $project['domain'], $project['id'] )
                && $this->bare_domain( (string) $project['domain'] ) === $wanted_domain ) {
                return (string) $project['id'];
            }
        }
        return null;
    }

    /**
     * Create a project for $domain. Returns the new project id.
     *
     * Maps to backend: POST /api/projects { domain, title }.
     *
     * @return string|WP_Error
     */
    /** Backend's project-limit rejection, verbatim (handlers/projects.py). */
    private const PROJECT_LIMIT_DESCRIPTION = 'Exceeded maximum amount of projects for a single user.';

    public function create_project( string $domain, string $title ) {
        $response = $this->request( 'POST', '/api/projects', [], [
            'domain' => $this->bare_domain( $domain ),
            'title'  => $title,
        ] );
        if ( is_wp_error( $response ) ) {
            return $response;
        }
        if ( (int) $response['status'] !== 200 || ! is_array( $response['body'] ) ) {
            $error_detail = is_array( $response['body'] ) && ! empty( $response['body']['description'] )
                ? (string) $response['body']['description']
                : sprintf( 'HTTP %d', (int) $response['status'] );
            if ( 400 === (int) $response['status'] && self::PROJECT_LIMIT_DESCRIPTION === $error_detail ) {
                /* translators: %s: reason the project could not be created — the API's description, or an HTTP status. */
                return new WP_Error( 'ubs_seo_project_limit', sprintf( __( 'Could not create a Ubersuggest project (%s).', 'ubersuggest-seo-tools' ), $error_detail ) );
            }
            /* translators: %s: reason the project could not be created — the API's description, or an HTTP status. */
            return new WP_Error( 'ubs_seo_project_create', sprintf( __( 'Could not create a Ubersuggest project (%s).', 'ubersuggest-seo-tools' ), $error_detail ) );
        }
        // Creation responses nest the project; accept either {project:{id}} or {id}.
        $project_id = $response['body']['project']['id'] ?? $response['body']['id'] ?? '';
        if ( $project_id === '' ) {
            return new WP_Error( 'ubs_seo_project_create', __( 'Project created but no id was returned.', 'ubersuggest-seo-tools' ) );
        }
        return (string) $project_id;
    }

    /**
     * Start (or fetch cached) AI fix suggestion for one issue on one page.
     * Response body: { done: bool, suggestion: string|null }.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function fix_suggestion_generate( string $project_id, string $issue_id, string $url, string $lang = 'en', bool $regenerate = false ) {
        $query = [ 'url' => $url, 'lang' => $lang ];
        if ( $regenerate ) {
            $query['regenerate'] = 'true';
        }
        return $this->request( 'GET', $this->fix_path( $project_id, 'generate_suggestion', $issue_id ), $query );
    }

    /**
     * Poll an in-flight AI fix suggestion. Body: { done, suggestion }.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function fix_suggestion_status( string $project_id, string $issue_id, string $url ) {
        return $this->request( 'GET', $this->fix_path( $project_id, 'suggestion_status', $issue_id ), [ 'url' => $url ] );
    }

    /**
     * Persist a user-edited suggestion, overwriting the AI result.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function fix_suggestion_save( string $project_id, string $issue_id, string $url, string $suggestion ) {
        return $this->request( 'POST', $this->fix_path( $project_id, 'save_suggestion', $issue_id ), [], [
            'url'        => $url,
            'suggestion' => $suggestion,
        ] );
    }

    /**
     * All already-generated (cached) suggestions for an issue, in one read — the
     * same endpoint the Ubersuggest Code Fix panel uses to restore the drawer.
     * Body: { pages: [ { url, suggestion: string|null, ... } ] }. No charge.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    public function fix_suggestions_list( string $project_id, string $issue_id ) {
        return $this->request( 'GET', $this->fix_path( $project_id, 'site_audit_issue', $issue_id ) );
    }

    /** Backend route for the fix_with_ai operations. */
    private function fix_path( string $project_id, string $type, string $issue_id ): string {
        return sprintf(
            '/api/projects/%s/seo_opportunities/fix_with_ai/type/%s/subtype/%s',
            rawurlencode( $project_id ),
            rawurlencode( $type ),
            rawurlencode( $issue_id )
        );
    }

    /** Strip scheme/path and a leading www. so domains compare cleanly. */
    private function bare_domain( string $domain ): string {
        $domain = trim( $domain );
        if ( strpos( $domain, '//' ) !== false ) {
            $domain = (string) wp_parse_url( $domain, PHP_URL_HOST );
        }
        return preg_replace( '/^www\./i', '', strtolower( $domain ) );
    }

    /**
     * Low-level HTTP request through WP's HTTP API.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    private function request( string $method, string $endpoint, array $query = [], array $body = [], array $headers = [] ) {
        $token = $this->bearer_token();
        if ( is_wp_error( $token ) ) {
            if ( isset( self::AUTH_ERROR_EXPIRED[ $token->get_error_code() ] ) ) {
                self::$last_auth_error = $token;
            }
            return $token;
        }
        self::$last_auth_error = null;

        $url = $this->base_url . '/' . ltrim( $endpoint, '/' );
        if ( ! empty( $query ) ) {
            $url = add_query_arg( $query, $url );
        }

        $args = [
            'method'  => strtoupper( $method ),
            'timeout' => 30,
            'headers' => $this->auth_headers( $token ) + $headers,
        ];

        if ( $args['method'] !== 'GET' && ! empty( $body ) ) {
            $args['body'] = wp_json_encode( $body );
        }

        $response = wp_remote_request( $url, $args );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = (int) wp_remote_retrieve_response_code( $response );
        $raw  = wp_remote_retrieve_body( $response );
        $json = json_decode( $raw, true );

        return [
            'status' => $code,
            'body'   => $json !== null ? $json : $raw,
        ];
    }

    /**
     * Resolve the bearer token: a connected OAuth account takes precedence,
     * otherwise fall back to the pasted API key.
     *
     * The no-credentials error is what a disconnected site owner actually reads,
     * both prefixed ("Couldn't load the site audit: …") and on its own in the fix
     * drawer — so it stays a full sentence, rather than naming the API key an
     * owner never sets.
     *
     * It names no destination on purpose: connecting lives in the app, not in
     * wp-admin. Callers that can offer that next step return the `notConnected`
     * flag through UBS_SEO_Rest::error_response() instead, and the UI renders its
     * own localized Connect screen; this sentence is only the fallback for the
     * paths that cannot.
     *
     * @return string|WP_Error
     */
    private function bearer_token() {
        $oauth = new UBS_SEO_OAuth_Client();
        if ( $oauth->is_connected() ) {
            return $oauth->get_access_token();
        }
        if ( $this->api_key !== '' ) {
            return $this->api_key;
        }
        return new WP_Error(
            'ubs_seo_no_auth',
            __( 'Your Ubersuggest account is not connected.', 'ubersuggest-seo-tools' )
        );
    }

    private function auth_headers( string $token ): array {
        return [
            'Accept'        => 'application/json',
            'Authorization' => 'Bearer ' . $token,
        ];
    }
}
