<?php
defined( 'ABSPATH' ) || exit;

/**
 * Reading a finished page crawl's verdict: is the issue still flagged there?
 * Never guesses — an unreadable answer stays unknown.
 */
trait UBS_SEO_Audit_Verdict {

    /**
     * Does the finished page crawl still flag $issue_id on this page?
     *
     * NULL means "couldn't tell" and must never be shown as a verdict: an empty
     * breakdown is indistinguishable from a failed fetch unless we keep them
     * apart (see breakdown_items), and treating a transport error as "not
     * flagged" would tell the user their fix worked on no evidence at all.
     *
     * @return bool|null True still flagged, false confirmed clear, null unknown.
     */
    public static function page_still_flagged( string $issue_id, string $path ): ?bool {
        $domain = self::audit_domain();
        if ( $domain === UBS_SEO_Project::domain() && self::mock_enabled() ) {
            $urls = UBS_SEO_Local_Audit::breakdown_urls( $issue_id );
        } else {
            $response = ( new UBS_SEO_Api_Client() )->get_site_audit_breakdown( $domain, $issue_id, $path );
            if ( is_wp_error( $response ) || (int) ( $response['status'] ?? 0 ) !== 200 ) {
                return null;
            }
            $result = is_array( $response['body'] ?? null ) ? ( $response['body']['result'] ?? null ) : null;
            if ( ! is_array( $result ) ) {
                return null;
            }
            // noData is the backend saying it holds no breakdown for this issue
            // on this page — for a page report that IS "clear", because the crawl
            // completed and produced no finding for it.
            if ( ! empty( $result['noData'] ) ) {
                return false;
            }
            $breakdown = $result['breakdown'] ?? null;
            if ( ! is_array( $breakdown ) ) {
                return null;
            }
            // Ignored pages count as still flagged: the crawl found the issue and
            // the user only chose to hide it, so reporting "fixed" would be false.
            if ( is_array( $result['ignored'] ?? null ) ) {
                $breakdown = array_merge( $breakdown, $result['ignored'] );
            }
            $urls = array_map( [ self::class, 'breakdown_item_url' ], $breakdown );
        }

        $target = self::normalize_url( self::local_url_for_path( $path ) );
        foreach ( $urls as $url ) {
            $url = (string) $url;
            if ( $url === '' ) {
                continue;
            }
            // Compare on path, not the whole URL: the crawler picks whichever of
            // the 8 scheme/www variants of this page won, so the URL it reports
            // routinely differs from ours on host and scheme while being the
            // same page. normalize_url already drops the scheme.
            if ( self::normalize_url( self::local_url_for_path( self::path_of( $url ) ) ) === $target ) {
                return true;
            }
        }
        return false;
    }

}
