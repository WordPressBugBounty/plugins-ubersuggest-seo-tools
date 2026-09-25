<?php
defined( 'ABSPATH' ) || exit;

/**
 * Ubersuggest OAuth2 client (authorization-code + PKCE).
 *
 * Talks to the backend OAuth2 provider:
 *   - authorize: GET  /api/oauth2/auth/
 *   - token:     POST /api/oauth2/token/
 *   - revoke:    POST /api/oauth2/revoke_token/
 *
 * It is a PUBLIC client: no client secret, security comes from PKCE (S256).
 * Tokens are stored in their own option (never in the user-facing settings).
 *
 * There is deliberately no broker URL to configure. The plugin used to route
 * through wordpress-oauth because the backend only accepted one whitelisted
 * redirect_uri, and a broker was the only way to fan that out to every site.
 * The backend now takes a per-site redirect_uri for public clients whose code
 * is bound to an S256 challenge, so the relay is gone. Do NOT reintroduce an
 * `oauth_base` setting: the option is stored per install, so a site that had
 * one saved would silently keep talking to a host that no longer exists.
 *
 * Backend prerequisite, per environment: the `ubersuggest-wordpress` row in
 * `oauth2_clients_<env>` must have `allow_dynamic_redirect_uris = true`
 * (absent = false). Without it the authorize endpoint rejects every site's
 * redirect_uri, surfacing as an opaque 502 "Internal server error" right
 * after login — see RELEASE-CHECKLIST.md for the fix command.
 */
class UBS_SEO_OAuth_Client {

    /** Public client id registered on the backend. */
    public const CLIENT_ID = 'ubersuggest-wordpress';

    /**
     * Scopes requested. `site_audit` gates the audit + AI-fix endpoints;
     * `projects` resolves/creates the UBS project the AI-fix endpoint is keyed
     * to; `domain` gates domain_overview (organic traffic / keywords) and
     * `backlinks` gates backlinks_overview — the dashboard's overview boxes.
     * The backend client registration must allow each scope (the grant is the
     * silent intersection of this request with that registration; verified
     * allowed on dev: profile domain keywords serp backlinks site_audit
     * content projects utility). Tokens issued before a scope was added here
     * do NOT gain it — the user must reconnect.
     */
    public const SCOPE = 'profile site_audit projects domain backlinks';

    /** Option holding the token set (autoload disabled). */
    private const TOKEN_OPTION = 'ubs_seo_oauth_tokens';

    /** Transient prefix for the per-flow PKCE verifier, keyed by state. */
    private const STATE_PREFIX = 'ubs_seo_oauth_state_';

    private string $base_url;

    public function __construct() {
        // Constant, never the stored option — see UBS_SEO_DEFAULT_BASE_URL.
        $this->base_url = untrailingslashit( UBS_SEO_DEFAULT_BASE_URL );
    }

    /** Authorize endpoint — browser-facing, where the user approves the grant. */
    private function authorize_endpoint(): string {
        return $this->base_url . '/api/oauth2/auth/';
    }

    private function token_endpoint(): string {
        return $this->base_url . '/api/oauth2/token/';
    }

    private function revoke_endpoint(): string {
        return $this->base_url . '/api/oauth2/revoke_token/';
    }

    public function is_connected(): bool {
        $tokens = $this->get_tokens();
        return ! empty( $tokens['access_token'] );
    }

    /** Space-separated scopes the backend actually granted on the stored token. */
    public function granted_scope(): string {
        $tokens = $this->get_tokens();
        return isset( $tokens['scope'] ) ? (string) $tokens['scope'] : '';
    }

    /**
     * Scopes requested that the stored token doesn't carry — a token issued
     * before a scope was added never gains it, so only reconnecting fixes it.
     *
     * @return string[] Empty when disconnected, or when the token reports no
     * scope at all: an unknown grant isn't evidence of a missing one.
     */
    public function missing_scopes(): array {
        if ( ! $this->is_connected() ) {
            return [];
        }
        $granted = preg_split( '/\s+/', trim( $this->granted_scope() ), -1, PREG_SPLIT_NO_EMPTY );
        if ( empty( $granted ) ) {
            return [];
        }
        return array_values( array_diff( explode( ' ', self::SCOPE ), $granted ) );
    }

    /**
     * Where the backend sends the browser back with the code — this site's own
     * app page (the Ubersuggest menu), not a registered constant. Nothing
     * whitelists it: the backend accepts a dynamic redirect for this client and
     * instead binds the code to it, so the value handed to /auth/ and the one
     * sent to /token/ must be byte-identical or the exchange fails. One method,
     * both callers. The callback handler lives in UBS_SEO_App_Page.
     *
     * Two consequences worth knowing before debugging a failed connect:
     * - admin_url() yields http:// on a site with no SSL, and the backend only
     *   accepts https (bar localhost/127.0.0.1). Such a site cannot connect.
     * - This URI already carries a query string, so the backend appends the
     *   code with `&`: ...?page=ubersuggest-seo-tools&code=…&state=…
     */
    public function redirect_uri(): string {
        return admin_url( 'admin.php?page=' . UBS_SEO_App_Page::PAGE_SLUG );
    }

    /**
     * Build the authorize URL and persist the PKCE verifier + state.
     * The user's browser is sent here to log in and approve.
     */
    public function get_authorize_url(): string {
        $verifier  = $this->base64url( random_bytes( 64 ) );
        $challenge = $this->base64url( hash( 'sha256', $verifier, true ) );
        $state     = wp_generate_password( 32, false );

        set_transient( self::STATE_PREFIX . $state, $verifier, 10 * MINUTE_IN_SECONDS );

        $args = [
            'response_type'         => 'code',
            'client_id'             => self::CLIENT_ID,
            'redirect_uri'          => $this->redirect_uri(),
            'scope'                 => self::SCOPE,
            'state'                 => $state,
            'code_challenge'        => $challenge,
            'code_challenge_method' => 'S256',
        ];

        // NOT add_query_arg: it interpolates values raw, so the scope's spaces
        // went out as literal spaces and the redirect_uri kept its own `?` and
        // `:` unescaped. That survived only because this particular URI has no
        // `&` in it — one would have truncated the value at the backend.
        //
        // It matters more now than it did behind the broker: the backend stores
        // the redirect_uri from THIS request and byte-compares it with the one
        // handle_callback() posts to /token/, which WordPress encodes properly.
        // Encoding both ends the same way removes the mismatch.
        return $this->authorize_endpoint() . '?' . http_build_query( $args, '', '&', PHP_QUERY_RFC3986 );
    }

    /**
     * Handle the redirect back from the backend: validate state, then
     * exchange the authorization code for tokens (sending the PKCE verifier).
     *
     * @return true|WP_Error
     */
    public function handle_callback( string $code, string $state ) {
        $verifier = get_transient( self::STATE_PREFIX . $state );
        if ( ! is_string( $verifier ) || $verifier === '' ) {
            return new WP_Error(
                'ubs_seo_oauth_state',
                __( 'Invalid or expired authorization request. Please try connecting again.', 'ubersuggest-seo-tools' )
            );
        }
        delete_transient( self::STATE_PREFIX . $state );

        $response = wp_remote_post( $this->token_endpoint(), [
            'timeout' => 30,
            'headers' => [ 'Accept' => 'application/json' ],
            'body'    => [
                'grant_type'    => 'authorization_code',
                'code'          => $code,
                'redirect_uri'  => $this->redirect_uri(),
                'client_id'     => self::CLIENT_ID,
                'code_verifier' => $verifier,
            ],
        ] );

        $stored = $this->store_token_response( $response );
        if ( true === $stored ) {
            // A fresh grant may belong to a different account than the last one.
            delete_transient( UBS_SEO_Rest::USER_EMAIL_TRANSIENT );
        }
        return $stored;
    }

    /**
     * Return a valid access token, refreshing first if it is at/near expiry.
     *
     * @return string|WP_Error
     */
    public function get_access_token() {
        $tokens = $this->get_tokens();
        if ( empty( $tokens['access_token'] ) ) {
            return new WP_Error( 'ubs_seo_not_connected', __( 'Not connected to Ubersuggest.', 'ubersuggest-seo-tools' ) );
        }

        // Refresh slightly ahead of expiry to avoid a race on the boundary.
        if ( ! empty( $tokens['expires_at'] ) && (int) $tokens['expires_at'] <= time() + 60 ) {
            $refreshed = $this->refresh();
            if ( is_wp_error( $refreshed ) ) {
                return $refreshed;
            }
            $tokens = $this->get_tokens();
        }

        return (string) $tokens['access_token'];
    }

    /**
     * Exchange the refresh token for a fresh token set.
     *
     * @return true|WP_Error
     */
    public function refresh() {
        $tokens = $this->get_tokens();
        if ( empty( $tokens['refresh_token'] ) ) {
            return new WP_Error( 'ubs_seo_no_refresh', __( 'Session expired. Please reconnect your Ubersuggest account.', 'ubersuggest-seo-tools' ) );
        }

        $response = wp_remote_post( $this->token_endpoint(), [
            'timeout' => 30,
            'headers' => [ 'Accept' => 'application/json' ],
            'body'    => [
                'grant_type'    => 'refresh_token',
                'refresh_token' => $tokens['refresh_token'],
                'client_id'     => self::CLIENT_ID,
            ],
        ] );

        return $this->store_token_response( $response );
    }

    /**
     * Revoke the current token on the backend and clear local storage.
     */
    public function disconnect(): void {
        $tokens = $this->get_tokens();
        if ( ! empty( $tokens['access_token'] ) ) {
            wp_remote_post( $this->revoke_endpoint(), [
                'timeout' => 15,
                'headers' => [ 'Accept' => 'application/json' ],
                'body'    => [
                    'token'     => $tokens['access_token'],
                    'client_id' => self::CLIENT_ID,
                ],
            ] );
        }
        delete_option( self::TOKEN_OPTION );
        delete_transient( UBS_SEO_Rest::FREE_PLAN_TRANSIENT );
        delete_transient( UBS_SEO_Rest::USER_EMAIL_TRANSIENT );
        UBS_SEO_Project::clear();
    }

    /**
     * @param array|WP_Error $response
     * @return true|WP_Error
     */
    private function store_token_response( $response ) {
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = (int) wp_remote_retrieve_response_code( $response );
        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $code !== 200 || ! is_array( $body ) || empty( $body['access_token'] ) ) {
            $detail = sprintf( 'HTTP %d', $code );
            if ( is_array( $body ) && ! empty( $body['error'] ) ) {
                $detail = (string) $body['error'];
            } else {
                // A body with no `error` key did not come from the backend: it
                // is the page of whatever refused the call on the way out —
                // a host firewall, an egress proxy, a CDN. Its own words are
                // the only evidence of which, and a bare "HTTP 403" sends the
                // owner to us for a block that was never ours. All the owner
                // can send support is the screen, so the screen carries it.
                $text = trim( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( wp_remote_retrieve_body( $response ) ) ) );
                if ( $text !== '' ) {
                    $detail .= ': ' . mb_substr( $text, 0, 160 );
                }
            }
            return new WP_Error(
                'ubs_seo_token_error',
                /* translators: %s: reason the token request failed — the provider's error code, or an HTTP status. */
                sprintf( __( 'Could not get an access token from Ubersuggest (%s).', 'ubersuggest-seo-tools' ), $detail )
            );
        }

        $this->save_tokens( [
            'access_token'  => (string) $body['access_token'],
            'refresh_token' => isset( $body['refresh_token'] ) ? (string) $body['refresh_token'] : '',
            'expires_at'    => isset( $body['expires_in'] ) ? time() + (int) $body['expires_in'] : 0,
            'scope'         => isset( $body['scope'] ) ? (string) $body['scope'] : '',
        ] );

        return true;
    }

    private function get_tokens(): array {
        $tokens = get_option( self::TOKEN_OPTION, [] );
        return is_array( $tokens ) ? $tokens : [];
    }

    private function save_tokens( array $tokens ): void {
        update_option( self::TOKEN_OPTION, $tokens, false );
        // Plan is account-bound and can change server-side at any time. The
        // cached email survives this on purpose: save_tokens() also runs on
        // every token REFRESH, and a refresh token cannot change accounts —
        // the email is cleared where accounts can actually change, in
        // handle_callback() and disconnect().
        delete_transient( UBS_SEO_Rest::FREE_PLAN_TRANSIENT );
    }

    /**
     * URL-safe base64 without padding, per the PKCE spec.
     *
     * Kept local, though UBS_SEO_Tracking_Client has the same one-liner: PKCE
     * is what makes this OAuth flow safe, and routing it through the analytics
     * client would leave a security primitive depending on the most disposable
     * part of the plugin.
     */
    private function base64url( string $raw ): string {
        // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- PKCE challenges are base64url by definition, not obfuscation.
        return rtrim( strtr( base64_encode( $raw ), '+/', '-_' ), '=' );
    }
}
