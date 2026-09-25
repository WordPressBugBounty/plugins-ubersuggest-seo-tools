<?php
defined( 'ABSPATH' ) || exit;

/**
 * Splitting the crawl's URLs into editable posts, the homepage and copy-only
 * URLs — plus the caching policy that keeps a failed fetch out of the cache.
 */
trait UBS_SEO_Audit_Page_Map {

    /**
     * The pages the CRAWL flagged for an issue, split into WordPress post ids
     * (URLs that resolve to a local published post — the ones a fix can write
     * to) and unmapped URLs (crawled pages we can't edit: custom routes,
     * archives, non-post pages — still shown, copy-only). This is the single
     * source of truth for which pages a fixable issue affects, so the plugin
     * matches the Ubersuggest app's Site Audit one-to-one instead of running
     * its own local detection.
     *
     * Cached per issue for a few minutes: status() runs for every issue on the
     * list render and preview polls every few seconds — neither may hit the
     * breakdown endpoint each time. The cache key carries the last COMPLETED
     * crawl's timestamp, so a finished crawl rolls the key and the cache
     * invalidates itself exactly when new data exists — never earlier (a
     * trigger-time bust just re-cached the old crawl) and never later.
     *
     * @return array{ids: int[], urls: string[], home?: string, failed?: bool}
     */
    public static function breakdown_pages( string $issue_id ): array {
        // Mock mode derives the lists from THIS site's posts: local queries,
        // cheap, and they change with the content (an apply changes them), so
        // a transient would only ever serve stale lists — and the mock path
        // never updates last_crawled, which would freeze the key below.
        if ( self::mock_enabled() ) {
            return self::compute_breakdown_pages( $issue_id );
        }

        $last_crawled = (int) get_option( 'ubs_seo_last_crawled_ms', 0 );
        $cache_key    = 'ubs_seo_bd_' . md5( self::audit_domain() . '|' . $issue_id . '|' . $last_crawled );
        $cached       = get_transient( $cache_key );
        if ( is_array( $cached ) && isset( $cached['ids'], $cached['urls'], $cached['home'] ) ) {
            return $cached;
        }

        $pages = self::compute_breakdown_pages( $issue_id );
        if ( ! empty( $pages['failed'] ) ) {
            return $pages; // never cache a failed fetch (see compute below)
        }
        set_transient( $cache_key, $pages, 5 * MINUTE_IN_SECONDS );
        return $pages;
    }

    /**
     * Fetch the breakdown and split it into post ids / homepage / unmapped
     * URLs. Uncached — breakdown_pages() owns the caching policy.
     *
     * @return array{ids: int[], urls: string[], home?: string, failed?: bool}
     */
    private static function compute_breakdown_pages( string $issue_id ): array {
        $breakdown = self::breakdown_urls( $issue_id );
        if ( $breakdown === null ) {
            // Fetch failed. NEVER cache this as an empty list: an empty breakdown
            // reads as "issue resolved" downstream (status() → 'ok'), which would
            // falsely confirm fixes and drop the Fix button on a transient error.
            // Return an uncached failure marker so the next render retries.
            return [ 'ids' => [], 'urls' => [], 'failed' => true ];
        }

        $ids  = [];
        $urls = [];
        $home = '';
        foreach ( $breakdown as $url ) {
            $post_id = self::resolve_local_post_id( $url );
            if ( $post_id > 0 && get_post_status( $post_id ) === 'publish' ) {
                $ids[] = $post_id;
                continue;
            }
            // The site root with no post behind it (blog-index homepage): still
            // fixable, just through site-level settings instead of post meta.
            // Config-gated: on a misconfigured static front page (page_on_front
            // missing, resolve returned 0 above) the home meta would be written
            // but never output — treat the root as unmapped instead.
            if ( $home === '' && UBS_SEO_Meta::blog_index_home_configured() && self::is_site_root_url( $url ) ) {
                $home = $url;
                continue;
            }
            $urls[] = $url;
        }
        return [
            'ids'  => array_values( array_unique( $ids ) ),
            'urls' => array_values( array_unique( $urls ) ),
            'home' => $home,
        ];
    }

}
