<?php
defined( 'ABSPATH' ) || exit;

/**
 * Single-page recrawl and its staleness baseline — the proof that the crawl we
 * asked for actually ran, instead of the backend serving the old report.
 */
trait UBS_SEO_Audit_Recrawl {

    /**
     * Crawl ONE page of the audit domain and report progress, mirroring
     * fetch_audit()'s contract (`{done: bool, ...}` or WP_Error) for the single-
     * page case.
     *
     * The page gets its own report on the backend, keyed `<domain><path>` — the
     * domain's report and its site-wide score are untouched, which is why this
     * can verify a fix without the user paying for a full re-crawl. The flip
     * side is that the issue counts on the dashboard do NOT move until the next
     * full crawl; the drawer says so rather than implying otherwise.
     *
     * @param bool $trigger Start the crawl. False only polls an in-flight one.
     * @return array{done:bool,crawl_count?:int,stale?:bool}|WP_Error `stale` is
     *         a crawl that never ran (see the baseline note below): the report is
     *         the OLD one, so it must not be read as a verdict.
     */
    public static function recrawl_page( string $path, bool $trigger = true ) {
        $domain = self::audit_domain();
        if ( $domain === UBS_SEO_Project::domain() && self::mock_enabled() ) {
            // The crawler can't reach a localhost site, so in mock mode there is
            // nothing to wait for: the mock re-derives every issue from the live
            // database on read, so the fix is already reflected.
            return [ 'done' => true ];
        }

        $client = new UBS_SEO_Api_Client();
        if ( $trigger ) {
            // Record what the page's report said BEFORE asking for a crawl. The
            // backend answers 204 without crawling when this page was crawled
            // less than a minute ago, or when the account has no active
            // subscription — and the status read that follows then serves the
            // OLD report with `done: true`. The only proof our crawl actually
            // ran is a `last_crawled` that MOVED, so the baseline has to be
            // taken before the trigger, not after.
            self::store_recrawl_baseline( $path, self::page_last_crawled( $client, $path ) );
            $triggered = $client->trigger_site_audit( $domain, $path );
            if ( is_wp_error( $triggered ) ) {
                return $triggered;
            }
        }

        $status = $client->get_site_audit_status( $domain, $path );
        if ( is_wp_error( $status ) ) {
            return $status;
        }
        $result = is_array( $status['body'] ?? null ) ? ( $status['body']['result'] ?? null ) : null;
        if ( is_array( $result ) ) {
            $done = ! empty( $result['done'] );
            $outcome = [
                'done'        => $done,
                'crawl_count' => (int) ( $result['crawl_count'] ?? 0 ),
            ];
            if ( $done && self::is_stale_recrawl( $path, $result ) ) {
                $outcome['stale'] = true;
            }
            if ( $done ) {
                self::clear_recrawl_baseline( $path );
            }
            return $outcome;
        }

        // "Task has not been set" for a path we just triggered means the crawl
        // hasn't registered yet — pending, not an error. Only a status read that
        // never had a trigger behind it is worth reporting.
        if ( self::is_no_crawl_yet( $status ) ) {
            return $trigger ? [ 'done' => false ] : new WP_Error(
                'ubs_seo_no_page_crawl',
                __( 'The page crawl did not start — try again.', 'ubersuggest-seo-tools' )
            );
        }

        return new WP_Error( 'ubs_seo_bad_response', __( 'Unexpected response from the audit API.', 'ubersuggest-seo-tools' ) );
    }

    /** Transient holding the pre-trigger `last_crawled` for one page's crawl. */
    private static function recrawl_baseline_key( string $path ): string {
        return 'ubs_seo_recrawl_base_' . md5( $path );
    }

    /**
     * Remember the page report's `last_crawled` from before the crawl request.
     *
     * An hour is far longer than any page crawl, so a missing baseline means the
     * start call is not part of this poll chain at all (a reload, or a poll that
     * arrived without a start) rather than an expiry mid-crawl.
     */
    private static function store_recrawl_baseline( string $path, int $last_crawled ): void {
        set_transient( self::recrawl_baseline_key( $path ), $last_crawled, HOUR_IN_SECONDS );
    }

    private static function clear_recrawl_baseline( string $path ): void {
        delete_transient( self::recrawl_baseline_key( $path ) );
    }

    /**
     * `last_crawled` (epoch ms) of the page's current report, 0 when it has none.
     *
     * Any failure reads as 0, which is the safe direction: a baseline of 0 can
     * only make a later report look NEWER, so a hiccup here degrades to trusting
     * the crawl — never to inventing a stale one.
     */
    private static function page_last_crawled( UBS_SEO_Api_Client $client, string $path ): int {
        $status = $client->get_site_audit_status( self::audit_domain(), $path );
        if ( is_wp_error( $status ) || ! is_array( $status['body'] ?? null ) ) {
            return 0;
        }
        $result = $status['body']['result'] ?? null;
        return is_array( $result ) ? (int) ( $result['report']['last_crawled'] ?? 0 ) : 0;
    }

    /**
     * Did the backend serve the previous report instead of crawling?
     *
     * True only when we hold a baseline AND the finished report is no newer than
     * it. Without a baseline we cannot prove staleness, so the verdict is let
     * through — claiming "too soon" on a crawl that may well have run would be
     * its own false report, just in the other direction.
     */
    private static function is_stale_recrawl( string $path, array $result ): bool {
        $baseline = get_transient( self::recrawl_baseline_key( $path ) );
        if ( $baseline === false ) {
            return false;
        }
        $last_crawled = (int) ( $result['report']['last_crawled'] ?? 0 );
        return $last_crawled <= (int) $baseline;
    }

}
