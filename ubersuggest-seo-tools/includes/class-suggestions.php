<?php
defined( 'ABSPATH' ) || exit;

/**
 * Source of the suggested text a fix applies (the new meta description, title
 * or H1): the UBS backend's AI fix endpoint, which holds the API key
 * server-side and meters usage per user. When the backend can't produce a
 * suggestion the row reports it and the UI offers a retry — there is no local
 * generation.
 *
 * Generation is async on the backend (generate → poll). Suggestions are cached
 * server-side per page, so after the first run repeat calls return immediately.
 */
class UBS_SEO_Suggestions {

    /** Issue ids whose suggestion we source from the backend. */
    public const AI_ISSUES = [
        'meta_description_empty',
        'title_long',
        'title_short',
        'title_empty',
        'absent_h1_tags',
    ];

    /**
     * Issue ids the backend can ALSO generate suggestions for (they're in its
     * ISSUE_PROMPT_CONFIG) but that have no local fix here — the UI offers
     * generate / copy / edit / regenerate on the affected pages, never Apply.
     */
    public const MANUAL_AI_ISSUES = [
        'have_title_duplicates',
        'duplicate_meta_descriptions',
    ];

    /** True when the backend can generate a suggestion for this issue. */
    public static function is_ai_capable( string $issue_id ): bool {
        return in_array( $issue_id, self::AI_ISSUES, true )
            || in_array( $issue_id, self::MANUAL_AI_ISSUES, true );
    }

    /** Credits a fresh generation costs on the backend (SUGGESTION_CREDIT_COST). */
    public const GENERATE_CREDIT_COST = 2;

    /** True when an AI suggestion can be sourced from the backend right now. */
    public static function backend_available(): bool {
        return UBS_SEO_Project::resolve_id() !== null;
    }

    /**
     * Non-blocking suggestion lookup for one page. Kicks off backend generation
     * and returns immediately — it never sleeps/polls — so a preview of many
     * pages can't time out the request. The UI polls this until every row is
     * 'ready'. When AI genuinely can't help (no project, un-crawlable page,
     * backend error, or done-with-no-suggestion) the row settles as 'fallback'
     * with NO suggestion — the UI reports the failure and offers Try again.
     *
     * @param string $mode 'list'       — show the page as generating with NO backend
     *                                     call, so a many-page preview renders instantly;
     *                      'generate'   — kick off generation (once);
     *                      'regenerate' — force a fresh, different suggestion (bypasses
     *                                     the server cache; costs 1 credit, not 2);
     *                      'status'     — read the result (poll, never re-charges).
     * @return array{status:string, suggestion?:string, source?:string}
     *   status: 'ready' (AI done) | 'pending' (still generating) | 'fallback' (failed)
     */
    public static function for_post_async( string $issue_id, WP_Post $post, string $mode = 'list', array $cached = [] ): array {
        if ( ! in_array( $issue_id, self::AI_ISSUES, true ) ) {
            return [ 'status' => 'fallback' ];
        }

        // List step: no per-page generation. Restore any suggestion already
        // generated for this page (from the server cache passed in $cached, keyed
        // by normalized URL) so reopening the drawer shows it — mirroring the
        // Ubersuggest Code Fix panel. Never charges. Pages with no cached
        // suggestion show as 'idle' (a Generate button).
        if ( $mode === 'list' ) {
            $page_url = apply_filters( 'ubs_seo_backend_page_url', get_permalink( $post ), $post, $issue_id );
            if ( is_string( $page_url ) && $page_url !== '' ) {
                $key = UBS_SEO_Audit_Service::normalize_url( $page_url );
                if ( isset( $cached[ $key ] ) && $cached[ $key ] !== '' ) {
                    return [ 'status' => 'ready', 'suggestion' => $cached[ $key ], 'source' => 'ai' ];
                }
            }
            return [ 'status' => 'idle' ];
        }

        // Regenerate is a generate that bypasses the server-side cache, so both
        // kick off a backend call; only 'status' polls without charging.
        $regenerate = ( $mode === 'regenerate' );
        $generate   = ( $mode === 'generate' || $regenerate );

        $project_id = apply_filters( 'ubs_seo_backend_project_id', null, $post, $issue_id );
        if ( $project_id === null ) {
            $project_id = UBS_SEO_Project::ensure_id();
        }
        $page_url = apply_filters( 'ubs_seo_backend_page_url', get_permalink( $post ), $post, $issue_id );
        if ( $project_id === null || ! is_string( $page_url ) || $page_url === '' ) {
            return [
                'status' => 'fallback',
                'debug'  => 'could not resolve project/url: project_id=' . wp_json_encode( $project_id ) . ' url=' . wp_json_encode( $page_url ),
            ];
        }

        $api_client = new UBS_SEO_Api_Client();
        $response   = self::call_backend( $api_client, $project_id, $issue_id, $page_url, $generate, $regenerate );

        // Self-heal a stale/mismatched project id: if the backend doesn't know
        // this project (e.g. the site was reconnected to a different account, so
        // the cached id belongs to the old one), forget it, re-resolve for the
        // CURRENT account, and retry once. Only on the kick-off (generate) call.
        if ( $generate && self::is_project_not_found( $response ) ) {
            UBS_SEO_Project::clear();
            $fresh = UBS_SEO_Project::ensure_id();
            if ( $fresh !== null && $fresh !== $project_id ) {
                $project_id = $fresh;
                $response   = self::call_backend( $api_client, $project_id, $issue_id, $page_url, true, $regenerate );
            }
        }

        $suggestion = self::read_suggestion( $response );
        if ( $suggestion !== null ) {
            return [ 'status' => 'ready', 'suggestion' => $suggestion, 'source' => 'ai' ];
        }
        // Out of credits: surface it instead of masking it as a plain failure.
        if ( self::is_limit_reached( $response ) ) {
            return [ 'status' => 'limit' ];
        }
        // Only a genuine 200 {done:false} is "still generating". Anything else —
        // transport error, non-200 (e.g. 404 project-not-found), or done-with-no-
        // suggestion — falls back, so we never poll forever on an error.
        $still_generating = ! is_wp_error( $response )
            && is_array( $response )
            && (int) ( $response['status'] ?? 0 ) === 200
            && ! self::is_done( $response );
        if ( $still_generating ) {
            return [ 'status' => 'pending' ];
        }

        // Capture exactly why the AI path didn't yield a suggestion, so the cause
        // is visible in the /fix/preview response (Network tab) instead of guessed.
        if ( is_wp_error( $response ) ) {
            $debug = 'wp_error: ' . $response->get_error_message();
        } else {
            $status = is_array( $response ) ? (int) ( $response['status'] ?? 0 ) : 0;
            $body   = is_array( $response ) ? wp_json_encode( $response['body'] ?? null ) : 'n/a';
            $debug  = "http {$status} body={$body} project={$project_id} url={$page_url}";
        }
        return [ 'status' => 'fallback', 'debug' => $debug ];
    }

    /**
     * URL-based twin of {@see for_post_async} for pages that exist only as
     * crawl URLs (manual issues): same generate / regenerate / status modes
     * and the same settled-with-nothing 'fallback' contract.
     *
     * @return array{status:string, suggestion?:string, source?:string, debug?:string}
     */
    public static function for_url_async( string $issue_id, string $page_url, string $mode ): array {
        if ( ! self::is_ai_capable( $issue_id ) || $page_url === '' ) {
            return [ 'status' => 'fallback' ];
        }

        $regenerate = ( $mode === 'regenerate' );
        $generate   = ( $mode === 'generate' || $regenerate );

        $project_id = apply_filters( 'ubs_seo_backend_project_id', null, null, $issue_id );
        if ( $project_id === null ) {
            $project_id = UBS_SEO_Project::ensure_id();
        }
        $page_url = apply_filters( 'ubs_seo_backend_page_url', $page_url, null, $issue_id );
        if ( $project_id === null || ! is_string( $page_url ) || $page_url === '' ) {
            return [ 'status' => 'fallback', 'debug' => 'could not resolve project/url' ];
        }

        $api_client = new UBS_SEO_Api_Client();
        $response   = self::call_backend( $api_client, $project_id, $issue_id, $page_url, $generate, $regenerate );

        // Same stale-project self-heal as the post-based path.
        if ( $generate && self::is_project_not_found( $response ) ) {
            UBS_SEO_Project::clear();
            $fresh = UBS_SEO_Project::ensure_id();
            if ( $fresh !== null && $fresh !== $project_id ) {
                $project_id = $fresh;
                $response   = self::call_backend( $api_client, $project_id, $issue_id, $page_url, true, $regenerate );
            }
        }

        $suggestion = self::read_suggestion( $response );
        if ( $suggestion !== null ) {
            return [ 'status' => 'ready', 'suggestion' => $suggestion, 'source' => 'ai' ];
        }
        if ( self::is_limit_reached( $response ) ) {
            return [ 'status' => 'limit' ];
        }
        $still_generating = ! is_wp_error( $response )
            && is_array( $response )
            && (int) ( $response['status'] ?? 0 ) === 200
            && ! self::is_done( $response );
        if ( $still_generating ) {
            return [ 'status' => 'pending' ];
        }

        if ( is_wp_error( $response ) ) {
            $debug = 'wp_error: ' . $response->get_error_message();
        } else {
            $status = is_array( $response ) ? (int) ( $response['status'] ?? 0 ) : 0;
            $body   = is_array( $response ) ? wp_json_encode( $response['body'] ?? null ) : 'n/a';
            $debug  = "http {$status} body={$body} project={$project_id} url={$page_url}";
        }
        return [ 'status' => 'fallback', 'debug' => $debug ];
    }

    /**
     * Credit balance keyed by a crawl URL (manual issues have no WP_Post).
     * No-charge: reads the limits object off a status call.
     *
     * @return array{used:int, limit:int, remaining:int, cost:int}|null
     */
    public static function credits_for_url( string $issue_id, string $page_url ): ?array {
        if ( ! self::is_ai_capable( $issue_id ) || $page_url === '' ) {
            return null;
        }
        $project_id = apply_filters( 'ubs_seo_backend_project_id', null, null, $issue_id );
        if ( $project_id === null ) {
            $project_id = UBS_SEO_Project::ensure_id();
        }
        $page_url = apply_filters( 'ubs_seo_backend_page_url', $page_url, null, $issue_id );
        if ( $project_id === null || ! is_string( $page_url ) || $page_url === '' ) {
            return null;
        }
        $response = ( new UBS_SEO_Api_Client() )->fix_suggestion_status( $project_id, $issue_id, $page_url );
        if ( is_wp_error( $response ) || ! is_array( $response['body'] ?? null ) ) {
            return null;
        }
        $limits = $response['body']['limits'] ?? null;
        if ( ! is_array( $limits ) ) {
            return null;
        }
        $limit = (int) ( $limits['monthly_keyword_metrics_updates_limits'] ?? 0 );
        $used  = (int) ( $limits['monthly_keyword_metrics_updates_used'] ?? 0 );
        return [
            'used'      => $used,
            'limit'     => $limit,
            'remaining' => max( 0, $limit - $used ),
            'cost'      => self::GENERATE_CREDIT_COST,
        ];
    }

    /**
     * One backend call: kick off generation, or (on a poll) just check status —
     * status NEVER re-fires the AI, so polling can't re-charge.
     *
     * @return array{status:int, body:mixed}|WP_Error
     */
    private static function call_backend( UBS_SEO_Api_Client $api_client, string $project_id, string $issue_id, string $page_url, bool $generate, bool $regenerate = false ) {
        return $generate
            ? $api_client->fix_suggestion_generate( $project_id, $issue_id, $page_url, self::language_code(), $regenerate )
            : $api_client->fix_suggestion_status( $project_id, $issue_id, $page_url );
    }

    /** True when the backend returned 404 "project not found" for the sent id. */
    private static function is_project_not_found( $response ): bool {
        if ( ! is_array( $response ) || (int) ( $response['status'] ?? 0 ) !== 404 ) {
            return false;
        }
        $body = $response['body'] ?? [];
        return is_array( $body ) && ( $body['error'] ?? '' ) === 'NOT_FOUND';
    }

    /** True when the backend refused because the monthly credit limit is reached. */
    private static function is_limit_reached( $response ): bool {
        if ( is_wp_error( $response ) || ! is_array( $response ) || ! is_array( $response['body'] ?? null ) ) {
            return false;
        }
        $body = $response['body'];
        return ( $body['code'] ?? '' ) === 'limit_reached'
            || ( $body['error'] ?? '' ) === 'REPORT_LIMIT_REACHED';
    }

    /**
     * Current credit balance for the fix feature, or null if it can't be read.
     * No-charge: the backend returns the limits object on a status call.
     *
     * @return array{used:int, limit:int, remaining:int, cost:int}|null
     */
    public static function credits( string $issue_id, WP_Post $post ): ?array {
        if ( ! in_array( $issue_id, self::AI_ISSUES, true ) ) {
            return null;
        }
        $project_id = apply_filters( 'ubs_seo_backend_project_id', null, $post, $issue_id );
        if ( $project_id === null ) {
            $project_id = UBS_SEO_Project::ensure_id();
        }
        $page_url = apply_filters( 'ubs_seo_backend_page_url', get_permalink( $post ), $post, $issue_id );
        if ( $project_id === null || ! is_string( $page_url ) || $page_url === '' ) {
            return null;
        }
        $response = ( new UBS_SEO_Api_Client() )->fix_suggestion_status( $project_id, $issue_id, $page_url );
        if ( is_wp_error( $response ) || ! is_array( $response['body'] ?? null ) ) {
            return null;
        }
        $limits = $response['body']['limits'] ?? null;
        if ( ! is_array( $limits ) ) {
            return null;
        }
        $limit = (int) ( $limits['monthly_keyword_metrics_updates_limits'] ?? 0 );
        $used  = (int) ( $limits['monthly_keyword_metrics_updates_used'] ?? 0 );
        return [
            'used'      => $used,
            'limit'     => $limit,
            'remaining' => max( 0, $limit - $used ),
            'cost'      => self::GENERATE_CREDIT_COST,
        ];
    }

    /**
     * Every already-generated suggestion for an issue, keyed by normalized URL,
     * fetched in ONE backend read (the same source the Ubersuggest Code Fix panel
     * uses to restore its drawer). Empty on no project / error, so the list step
     * degrades to all-idle. No charge.
     *
     * @return array<string,string> normalized url => suggestion text
     */
    /**
     * @param bool $allow_create Whether a missing project may be CREATED to
     *                           answer this read. False for callers that only
     *                           annotate something (the fix history's
     *                           ai-vs-edited column): they must never turn a
     *                           write path into a backend POST.
     */
    public static function cached_map( string $issue_id, bool $allow_create = true ): array {
        if ( ! self::is_ai_capable( $issue_id ) ) {
            return [];
        }
        $project_id = apply_filters( 'ubs_seo_backend_project_id', null, null, $issue_id );
        if ( $project_id === null ) {
            $project_id = $allow_create ? UBS_SEO_Project::ensure_id() : UBS_SEO_Project::resolve_id();
        }
        if ( $project_id === null ) {
            return [];
        }
        $response = ( new UBS_SEO_Api_Client() )->fix_suggestions_list( $project_id, $issue_id );
        if ( is_wp_error( $response ) || ! is_array( $response['body'] ?? null ) ) {
            return [];
        }
        $pages = $response['body']['pages'] ?? null;
        if ( ! is_array( $pages ) ) {
            return [];
        }
        $map = [];
        foreach ( $pages as $page ) {
            if ( ! is_array( $page ) ) {
                continue;
            }
            $url        = (string) ( $page['url'] ?? '' );
            $suggestion = $page['suggestion'] ?? null;
            if ( $url === '' || ! is_string( $suggestion ) || $suggestion === '' ) {
                continue;
            }
            $map[ UBS_SEO_Audit_Service::normalize_url( $url ) ] = $suggestion;
        }
        return $map;
    }

    /**
     * Pull a non-empty suggestion string from a { done, suggestion } response,
     * or null if not present.
     *
     * @param array{status:int, body:mixed}|WP_Error $response
     * @return string|null
     */
    private static function read_suggestion( $response ) {
        if ( is_wp_error( $response ) || ! is_array( $response ) || ! is_array( $response['body'] ) ) {
            return null;
        }
        $suggestion = $response['body']['suggestion'] ?? null;
        return is_string( $suggestion ) && $suggestion !== '' ? $suggestion : null;
    }

    /** @param array{status:int, body:mixed}|WP_Error $response */
    private static function is_done( $response ): bool {
        return is_array( $response ) && is_array( $response['body'] ) && ! empty( $response['body']['done'] );
    }

    /** Two-letter language code from the site locale. */
    private static function language_code(): string {
        $language_code = substr( (string) get_locale(), 0, 2 );
        return $language_code !== '' ? strtolower( $language_code ) : 'en';
    }
}
