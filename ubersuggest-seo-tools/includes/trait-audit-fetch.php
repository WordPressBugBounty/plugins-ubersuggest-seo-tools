<?php
defined( 'ABSPATH' ) || exit;

/**
 * The crawl's lifecycle: resolving the target domain, starting and reading a
 * crawl, and stopping one — the entry point every other concern reads from.
 */
trait UBS_SEO_Audit_Fetch {

    /**
     * Domain the audit targets: always THIS site's own domain — the plugin
     * audits the site it runs on, and the user can't retarget it. The
     * `ubs_seo_audit_domain` filter is a dev-only escape hatch (the localhost
     * bridge points it at a crawlable domain, since the backend can't reach
     * localhost); it is never exposed in the UI.
     */
    public static function audit_domain(): string {
        $domain = (string) apply_filters( 'ubs_seo_audit_domain', UBS_SEO_Project::domain() );
        return $domain !== '' ? $domain : UBS_SEO_Project::domain();
    }

    /**
     * Whether the development mock is standing in for the backend audit.
     *
     * The mock ships only in the development checkout (dev/, outside the release
     * allowlist), so the class is simply absent from the distributed plugin —
     * the class_exists test is what makes that absence a plain "no mock" instead
     * of a fatal error.
     */
    private static function mock_enabled(): bool {
        return class_exists( 'UBS_SEO_Local_Audit' ) && UBS_SEO_Local_Audit::enabled();
    }

    /**
     * Whether the mock answers for $domain. It stands in for THIS site only —
     * the crawler cannot reach localhost — so any other domain goes to the
     * backend even with the mock on. The crawl entry points below ask through
     * here so their copies of the test cannot drift apart.
     */
    private static function is_mocked( string $domain ): bool {
        return $domain === UBS_SEO_Project::domain() && self::mock_enabled();
    }

    /**
     * Run an audit for $domain. The local mock only applies to THIS WordPress
     * site (the crawler can't reach localhost); a custom external domain always
     * goes to the backend crawler. Same `{done, report}` shape either way.
     *
     * @param bool $trigger Start a fresh crawl first (counts against the daily
     *                      limit). False just reads the latest crawl status.
     * @return array|WP_Error
     */
    public static function fetch_audit( string $domain, bool $trigger = true ) {
        if ( self::is_mocked( $domain ) ) {
            return self::remember( UBS_SEO_Local_Audit::report( $trigger ), $domain );
        }

        $client = new UBS_SEO_Api_Client();
        if ( $trigger ) {
            $triggered = $client->trigger_site_audit( $domain );
            if ( is_wp_error( $triggered ) ) {
                return $triggered;
            }
            // NOTE: nothing to invalidate here. The breakdown cache is keyed by
            // the last COMPLETED crawl (see breakdown_pages), so it rolls over
            // by itself when this crawl finishes. Busting at trigger time was
            // wrong twice over: the new crawl's breakdown doesn't exist yet
            // (the next read just re-cached the old one), and the old lists are
            // exactly what should be shown until the crawl completes.
        }
        $result = self::last_report( $domain );
        if ( is_wp_error( $result ) || is_array( $result ) ) {
            return $result;
        }

        // First use: no crawl exists yet (the backend replies "Task has not been
        // set"). The status endpoint never starts one, so kick off the first crawl
        // and report pending — the UI polls until it's ready instead of erroring.
        // Only when we didn't already trigger one on this call.
        if ( ! $trigger ) {
            $started = $client->trigger_site_audit( $domain );
            if ( is_wp_error( $started ) ) {
                return $started;
            }
            return [ 'done' => false ];
        }

        return new WP_Error( 'ubs_seo_bad_response', __( 'Unexpected response from the audit API.', 'ubersuggest-seo-tools' ) );
    }

    /**
     * The crawl's current status for $domain, reading only.
     *
     * The difference from {@see self::fetch_audit()} is the whole point: a
     * domain the backend has nothing stored for comes back as `null` instead of
     * starting a crawl. Cancelling reads through here for exactly that reason —
     * the auto-start would relaunch the crawl the user just stopped.
     *
     * @return array|null|WP_Error `null` when the backend holds no report and
     *                             no pending task for this domain.
     */
    public static function last_report( string $domain ) {
        if ( self::is_mocked( $domain ) ) {
            return self::remember( UBS_SEO_Local_Audit::report( false ), $domain );
        }

        $status = ( new UBS_SEO_Api_Client() )->get_site_audit_status( $domain );
        if ( is_wp_error( $status ) ) {
            return $status;
        }
        $result = is_array( $status['body'] ?? null ) ? ( $status['body']['result'] ?? null ) : null;
        if ( is_array( $result ) ) {
            return self::remember( $result, $domain );
        }
        if ( self::is_no_crawl_yet( $status ) ) {
            return null;
        }
        return new WP_Error( 'ubs_seo_bad_response', __( 'Unexpected response from the audit API.', 'ubersuggest-seo-tools' ) );
    }

    /**
     * Keep what wp-admin needs from a crawl result before handing it on.
     *
     * Every read of a report — the audit screen, the issues list, a cancel, the
     * development mock — comes through here, which is what lets the dashboard
     * widget and the audit notice render without a request of their own.
     *
     * The two stores are not redundant, so do not collapse them. The bare option
     * is the fixes' baseline for "page edited after the crawl"; the snapshot is
     * domain-gated and reads as 0 on a site whose database moved, which for the
     * fixes would mean "crawl time unknown, trust the crawl" and let an apply
     * overwrite an edit the user made since.
     *
     * Only THIS site's own crawl becomes a snapshot. Every caller passes
     * audit_domain() today, but fetch_audit() accepts any domain, and a report
     * for another one would be written under a key
     * {@see UBS_SEO_Audit_Snapshot::current()} then refuses to read — blanking
     * both surfaces with no way to tell why.
     *
     * @param array|WP_Error|null $result
     * @return array|WP_Error|null The same $result, for chaining.
     */
    private static function remember( $result, string $domain ) {
        $crawled_at_ms = is_array( $result ) ? (int) ( $result['report']['last_crawled'] ?? 0 ) : 0;
        if ( $crawled_at_ms <= 0 ) {
            return $result;
        }

        update_option( 'ubs_seo_last_crawled_ms', $crawled_at_ms, false );
        if ( $domain === self::audit_domain() ) {
            UBS_SEO_Audit_Snapshot::store( self::audit_to_ui( $result, $domain ), $crawled_at_ms );
        }
        return $result;
    }

    /**
     * Stop the crawl running for $domain, so the UI can fall back to the last
     * completed report instead of polling a crawl the user abandoned.
     *
     * "Nothing to stop" counts as success: the backend answers 400 "Task has
     * not been set" when the crawl finished (or never started) between the poll
     * that showed it running and this call, and the caller's goal — no crawl in
     * flight — already holds there. Only a real failure comes back as an error,
     * because that one leaves the crawl running and the user must be told.
     *
     * @return true|WP_Error
     */
    public static function cancel_audit( string $domain ) {
        // The mock never reaches the crawler, so its simulated crawl is the
        // only thing there is to stop.
        if ( self::is_mocked( $domain ) ) {
            UBS_SEO_Local_Audit::cancel();
            return true;
        }

        $response = ( new UBS_SEO_Api_Client() )->stop_site_audit( $domain );
        if ( is_wp_error( $response ) ) {
            return $response;
        }
        $status = (int) ( $response['status'] ?? 0 );
        if ( 204 === $status || 200 === $status || self::is_no_crawl_yet( $response ) ) {
            return true;
        }
        return new WP_Error( 'ubs_seo_stop_failed', __( 'Could not stop the crawl.', 'ubersuggest-seo-tools' ) );
    }

    /**
     * True when the backend holds no pending crawl for this domain ("Task has
     * not been set"). Read two ways: by {@see self::fetch_audit()} as "first
     * use, start one", and by {@see self::cancel_audit()} as "already stopped".
     */
    private static function is_no_crawl_yet( $status ): bool {
        if ( ! is_array( $status ) || ! is_array( $status['body'] ?? null ) ) {
            return false;
        }
        $description = strtolower( (string) ( $status['body']['description'] ?? '' ) );
        return strpos( $description, 'not been set' ) !== false;
    }

}
