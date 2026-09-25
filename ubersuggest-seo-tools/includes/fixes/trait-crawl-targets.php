<?php
defined( 'ABSPATH' ) || exit;

/**
 * The pages the backend crawl flagged for an issue, and whether they are
 * still flagged locally. The crawl is the single source of truth for WHICH
 * pages a fix touches — this is the only place that reads its breakdown.
 */
trait UBS_SEO_Crawl_Target_Pages {

    /**
     * Post ids of the pages the CRAWL flagged for this issue. The backend Site
     * Audit is the single source of truth — the plugin shows and fixes exactly
     * what the Ubersuggest app shows (one-to-one), never a local re-detection.
     *
     * @return int[] published post ids among the crawl's flagged URLs
     */
    protected function target_ids(): array {
        return UBS_SEO_Audit_Service::breakdown_pages( $this->issue_id() )['ids'];
    }

    /**
     * Crawl-flagged URLs that don't resolve to an editable post (custom routes,
     * archives, non-post pages). Still listed in the preview — copy-only.
     *
     * @return string[]
     */
    protected function unmapped_urls(): array {
        $pages = UBS_SEO_Audit_Service::breakdown_pages( $this->issue_id() );
        $urls  = $pages['urls'];
        // A flagged homepage this fix can't write site-level meta for (e.g. the
        // H1 fix — a blog index's heading is theme markup) is still shown, just
        // copy-only, so the drawer stays 1:1 with the app.
        if ( ! $this->supports_home() && ( $pages['home'] ?? '' ) !== '' ) {
            $urls[] = (string) $pages['home'];
        }
        return $urls;
    }

    /**
     * Whether $post was edited AFTER the last completed crawl. Distinguishes
     * "the user fixed this page since the crawl" (skip — never overwrite) from
     * "nothing changed locally, the crawl's flag stands" (apply). Unknown crawl
     * time counts as untouched, i.e. the crawl is trusted.
     */
    protected function modified_since_crawl( WP_Post $post ): bool {
        $crawled = UBS_SEO_Audit_Service::last_crawled_timestamp();
        if ( $crawled <= 0 ) {
            return false;
        }
        return (int) get_post_modified_time( 'U', true, $post ) > $crawled;
    }

}
