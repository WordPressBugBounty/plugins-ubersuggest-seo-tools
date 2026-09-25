<?php
defined( 'ABSPATH' ) || exit;

/**
 * The dashboard's read endpoints: Site Audit overview, Core Web Vitals and the
 * domain-level metric boxes.
 */
trait UBS_SEO_Rest_Audit {

    /**
     * Site Audit overview for the UI's main screen, shaped exactly to what the
     * React page consumes (overview boxes, page status, top issues).
     */
    public function audit( WP_REST_Request $request ): WP_REST_Response {
        $domain = UBS_SEO_Audit_Service::audit_domain();
        // `poll=1` reads the current crawl status WITHOUT starting a new crawl
        // (a fresh crawl counts against the daily limit). The Recrawl button
        // starts one crawl, then polls with poll=1 until it finishes — so the
        // refreshed report reflects any fixes just applied to the live site.
        $trigger = ! (bool) $request->get_param( 'poll' );

        return $this->audit_response( $domain, UBS_SEO_Audit_Service::fetch_audit( $domain, $trigger ) );
    }

    /**
     * Stop the crawl in flight and answer with the report it falls back to.
     *
     * One round trip on purpose. Cancelling and then letting the UI re-read
     * /audit would race: on a site whose first crawl this was, the read finds
     * nothing stored and starts a crawl of its own — relaunching the one the
     * user just cancelled. So the stop and the read that follows it happen
     * here, and the read goes through last_report(), which never starts one.
     */
    public function cancel_audit(): WP_REST_Response {
        $domain  = UBS_SEO_Audit_Service::audit_domain();
        $stopped = UBS_SEO_Audit_Service::cancel_audit( $domain );

        if ( is_wp_error( $stopped ) ) {
            // A dead account still becomes the connect prompt. Any OTHER
            // failure means the crawl is still running, and that travels as a
            // code, not through error_response(): an {error} payload puts the
            // UI on the full error screen — wiping the progress view of a
            // crawl that never stopped — and its WP_Error sentence would reach
            // the user in English. React renders cancel_crawl_failed instead.
            if ( array_key_exists( $stopped->get_error_code(), UBS_SEO_Api_Client::AUTH_ERROR_EXPIRED ) ) {
                return $this->error_response( $stopped );
            }
            return new WP_REST_Response( [ 'stopFailed' => true ] );
        }
        $result = UBS_SEO_Audit_Service::last_report( $domain );
        if ( is_wp_error( $result ) ) {
            // The stop already succeeded — routing this through
            // audit_response() would answer {error}, which the UI reads as THE
            // CANCEL failing (in PHP English, at that) while the crawl is in
            // fact gone. Only the fallback read broke, and that travels as a
            // code. Auth still becomes the connect prompt.
            if ( array_key_exists( $result->get_error_code(), UBS_SEO_Api_Client::AUTH_ERROR_EXPIRED ) ) {
                return $this->error_response( $result );
            }
            return new WP_REST_Response( [ 'stopped' => true, 'reportUnavailable' => true ] );
        }
        if ( $result === null ) {
            // Nothing was ever crawled for this site, so there is no report to
            // fall back to — the UI offers to start a crawl instead of polling.
            return new WP_REST_Response( [ 'stopped' => true, 'noReport' => true ] );
        }

        return $this->audit_response( $domain, $result );
    }

    /**
     * The three shapes the UI's audit screen reads — a dead account, a crawl
     * still running, a finished report — from one crawl status.
     *
     * Shared by {@see self::audit()} and {@see self::cancel_audit()} so the two
     * cannot drift into answering the same state differently.
     *
     * @param array|WP_Error $result
     */
    private function audit_response( string $domain, $result ): WP_REST_Response {
        if ( is_wp_error( $result ) ) {
            return $this->error_response( $result );
        }
        if ( empty( $result['done'] ) ) {
            return new WP_REST_Response( [
                'pending'    => true,
                'crawlCount' => (int) ( $result['crawl_count'] ?? 0 ),
                'crawlMax'   => (int) ( $result['crawl_max_pages'] ?? 0 ),
            ], 200 );
        }

        return new WP_REST_Response( UBS_SEO_Audit_Service::audit_to_ui( $result, $domain ) );
    }

    /**
     * Core Web Vitals for the audit domain. Async on the backend, so the UI polls
     * this until `done` is true; `force=1` bypasses the backend's 7-day cache.
     *
     * Failures go through error_response() like every other load path, so a dead
     * or missing account arrives as the `notConnected` flag the UI renders in the
     * reader's language rather than as a raw English WP_Error message.
     */
    public function pagespeed( WP_REST_Request $request ): WP_REST_Response {
        $domain = UBS_SEO_Audit_Service::audit_domain();
        $force  = (bool) $request->get_param( 'force' );
        $result = UBS_SEO_Page_Speed_Service::fetch( $domain, $force );

        if ( is_wp_error( $result ) ) {
            return $this->error_response( $result );
        }
        return new WP_REST_Response( $result );
    }

    /**
     * Domain-level metrics for the dashboard's overview boxes: organic monthly
     * traffic, organic keyword count and backlinks. Cached in a transient for a
     * day — the numbers move slowly and the backend call counts against the
     * account's report limit. `unavailable` (never an error) when the account
     * can't provide them (missing `domain` scope on an old token, no data for
     * the domain, backend hiccup), so the UI degrades to "—".
     */
    public function overview_metrics(): WP_REST_Response {
        $domain    = UBS_SEO_Audit_Service::audit_domain();
        $cache_key = 'ubs_seo_overview_metrics_' . md5( $domain );

        $cached = get_transient( $cache_key );
        if ( is_array( $cached ) ) {
            return new WP_REST_Response( $cached );
        }

        $response = ( new UBS_SEO_Api_Client() )->get_domain_overview( $domain );
        if ( is_wp_error( $response ) || (int) ( $response['status'] ?? 0 ) !== 200 ) {
            // Not cached: a transient failure (or a reconnect that adds the
            // scope) should be able to succeed on the next visit.
            return new WP_REST_Response( [ 'unavailable' => true ] );
        }

        $body = is_array( $response['body'] ?? null ) ? $response['body'] : [];
        if ( ! empty( $body['noData'] ) ) {
            $metrics = [ 'unavailable' => true ];
        } else {
            $metrics = [
                'organicTraffic'  => (int) ( $body['traffic'] ?? 0 ),
                'organicKeywords' => (int) ( $body['organic'] ?? 0 ),
                'backlinks'       => (int) ( $body['backlinks'] ?? 0 ),
            ];
        }
        set_transient( $cache_key, $metrics, DAY_IN_SECONDS );
        return new WP_REST_Response( $metrics );
    }

}
