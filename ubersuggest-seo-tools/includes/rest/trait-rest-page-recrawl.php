<?php
defined( 'ABSPATH' ) || exit;

/**
 * Re-crawling one already-fixed page and reporting whether the crawl still
 * flags it — the drawer's verification step.
 */
trait UBS_SEO_Rest_Page_Recrawl {

    /**
     * Re-crawl ONE already-fixed page and report whether the crawl still flags
     * the issue on it — the drawer's "did my fix land?" check.
     *
     * Two modes, like fix_preview: the first call starts the crawl, then `poll=1`
     * follows it without starting another (each start counts against the daily
     * report limit). GET for both, mirroring the backend's own site_audit call
     * and the /audit route above.
     *
     * The verdict is deliberately three-valued. 'unknown' covers a crawl that
     * finished but whose breakdown we couldn't read, and the UI must not round
     * that up to "fixed" — see page_still_flagged.
     */
    public function page_recrawl( WP_REST_Request $request ): WP_REST_Response {
        $issue = sanitize_text_field( (string) $request->get_param( 'issue' ) );
        $ref   = $this->sanitize_ref( (string) $request->get_param( 'ref' ) );
        if ( $issue === '' || $ref === '' ) {
            return new WP_REST_Response( [ 'error' => __( 'Missing issue or page reference.', 'ubersuggest-seo-tools' ) ], 200 );
        }

        $path = UBS_SEO_Audit_Service::page_path_for_ref( $ref );
        if ( $path === '' ) {
            // No crawlable page behind the row (a post that has since been
            // deleted or unpublished, so it has no permalink any more).
            return new WP_REST_Response( [ 'error' => __( 'This page can no longer be crawled.', 'ubersuggest-seo-tools' ) ], 200 );
        }

        $result = UBS_SEO_Audit_Service::recrawl_page( $path, ! (bool) $request->get_param( 'poll' ) );
        if ( is_wp_error( $result ) ) {
            return $this->error_response( $result );
        }
        if ( empty( $result['done'] ) ) {
            return new WP_REST_Response( [
                'pending'    => true,
                'crawlCount' => (int) ( $result['crawl_count'] ?? 0 ),
            ], 200 );
        }

        // The backend declined to crawl (this page was crawled under a minute
        // ago, or the account can't re-crawl on demand) and served the previous
        // report. Reading a breakdown here would describe the OLD crawl, so the
        // answer is "ask again in a moment" — never a verdict.
        if ( ! empty( $result['stale'] ) ) {
            return new WP_REST_Response( [ 'pending' => false, 'verdict' => 'too_soon' ], 200 );
        }

        $still_flagged = UBS_SEO_Audit_Service::page_still_flagged( $issue, $path );
        return new WP_REST_Response( [
            'pending' => false,
            'verdict' => $still_flagged === null
                ? 'unknown'
                : ( $still_flagged ? 'still_flagged' : 'fixed' ),
        ], 200 );
    }

}
