<?php
defined( 'ABSPATH' ) || exit;

/**
 * The last two finished audits, kept locally so the dashboard widget and the
 * audit notice can render without calling the backend.
 *
 * Two records rather than one because a score is nearly meaningless without the
 * direction it moved in.
 */
class UBS_SEO_Audit_Snapshot {

    private const CURRENT  = 'ubs_seo_audit_snapshot';
    private const PREVIOUS = 'ubs_seo_audit_snapshot_previous';

    /**
     * Record a finished audit, rolling the one it replaces into the previous slot.
     *
     * Fed the React screen's own payload rather than the raw crawl report, so
     * the widget can never quote a different number than the page it links to.
     *
     * @param int $crawled_at_ms The crawl's completion time, epoch milliseconds.
     */
    public static function store( array $ui, int $crawled_at_ms ): void {
        if ( $crawled_at_ms <= 0 ) {
            return;
        }

        $current = self::current();
        if ( null !== $current && $current['crawledAt'] >= $crawled_at_ms ) {
            // The UI polls, so one finished crawl arrives many times; a backend
            // answering with an older crawl than the one on record would roll
            // the real latest audit into the previous slot and invert the delta.
            return;
        }
        if ( null !== $current ) {
            update_option( self::PREVIOUS, $current, false );
        }

        update_option(
            self::CURRENT,
            [
                'domain'       => (string) ( $ui['domain'] ?? '' ),
                'crawledAt'    => $crawled_at_ms,
                'seoScore'     => (int) ( $ui['overview']['seoScore'] ?? 0 ),
                'pagesCrawled' => (int) ( $ui['pagesCrawled'] ?? 0 ),
                'pageStatus'   => array_map( 'intval', (array) ( $ui['pageStatus'] ?? [] ) ),
                'totalIssues'  => (int) ( $ui['totalIssues'] ?? 0 ),
                // Ids and counts only. The label is resolved when rendered, in
                // the READER's locale — baking it in would show every admin the
                // language of whoever happened to run the audit.
                'topIssues'    => array_values( array_map(
                    static fn( $issue ) => [
                        'id'    => (string) ( $issue['id'] ?? '' ),
                        'count' => (int) ( $issue['count'] ?? 0 ),
                    ],
                    array_slice( (array) ( $ui['topIssues'] ?? [] ), 0, 3 )
                ) ),
            ],
            false
        );
    }

    public static function current(): ?array {
        return self::read( self::CURRENT );
    }

    public static function previous(): ?array {
        return self::read( self::PREVIOUS );
    }

    /** When the latest audit finished, epoch milliseconds; 0 before the first. */
    public static function crawled_at(): int {
        return (int) ( self::current()['crawledAt'] ?? 0 );
    }

    /**
     * Points gained or lost since the previous audit, null while there is
     * nothing to compare against.
     *
     * Null and zero are different answers — "no history yet" versus "held
     * steady" — and the widget renders them differently.
     */
    public static function score_delta(): ?int {
        $current  = self::current();
        $previous = self::previous();
        if ( null === $current || null === $previous ) {
            return null;
        }
        return $current['seoScore'] - $previous['seoScore'];
    }

    /**
     * A record is only valid for the domain it was taken from: a site moved
     * from staging to production keeps its database, and reading the staging
     * crawl as production data would put the wrong score on the dashboard.
     *
     * The writing half of that invariant lives in
     * UBS_SEO_Audit_Fetch::remember(), which only stores a crawl of the site's
     * own domain. Change one and the other stops making sense.
     */
    private static function read( string $option ): ?array {
        $stored = get_option( $option );
        if ( ! is_array( $stored ) || ! isset( $stored['crawledAt'] ) ) {
            return null;
        }
        if ( ( $stored['domain'] ?? '' ) !== UBS_SEO_Audit_Service::audit_domain() ) {
            return null;
        }
        return $stored;
    }
}
