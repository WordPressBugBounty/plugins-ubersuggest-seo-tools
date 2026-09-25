<?php
defined( 'ABSPATH' ) || exit;

/**
 * Resolving one crawl URL to a local published post id. Isolated on purpose:
 * a wrong match here writes a fix onto the wrong page.
 */
trait UBS_SEO_Audit_Post_Resolver {

    /**
     * Resolve a crawl URL to a local published post id, tolerant of the ways a
     * crawl URL legitimately differs from home_url(): a host variant (apex vs
     * subdomain, or a proxy the crawler followed) and the site-root URL, which
     * url_to_postid() never resolves. Returns 0 when no editable post matches.
     */
    private static function resolve_local_post_id( string $url ): int {
        $path  = (string) wp_parse_url( $url, PHP_URL_PATH );
        $query = (string) wp_parse_url( $url, PHP_URL_QUERY );

        // Site root: url_to_postid() returns 0 for it. A static front page is an
        // editable post; a blog-index home has no single post to fix. Uses the
        // host- and subdirectory-aware check: '/wp' is the root of a subdirectory
        // install, and its bare 'wp' segment must never reach the slug fallback.
        if ( self::is_site_root_url( $url ) ) {
            return get_option( 'show_on_front' ) === 'page'
                ? (int) get_option( 'page_on_front' )
                : 0;
        }

        // Rebuild the URL on THIS site's scheme+host so url_to_postid — which
        // bails when the host differs from home_url() beyond a www. prefix — can
        // resolve a crawl URL served from a host variant of the same site. ONLY
        // the host is swapped: the crawl path already contains any subdirectory
        // the site lives in, so home_url( $path ) would double it
        // (site.com/wp/wp/…) and url_to_postid would never match again — on
        // subdirectory installs that silently demoted the slug fallback into
        // the primary resolution path.
        $home  = wp_parse_url( home_url() );
        $local = ( $home['scheme'] ?? 'https' ) . '://' . ( $home['host'] ?? '' )
            . ( isset( $home['port'] ) ? ':' . $home['port'] : '' )
            . ( $path === '' ? '/' : $path )
            . ( $query !== '' ? '?' . $query : '' );

        $post_id = url_to_postid( $local );
        if ( $post_id > 0 ) {
            return $post_id;
        }

        // Fallback for URLs url_to_postid can't parse (encoded characters and
        // similar rewrite hiccups on legitimate post URLs). Matching by slug
        // ALONE is not enough to select a write target: the crawler flags
        // archives too (/category/news/ would match a post named "news"), and
        // hierarchical pages can share a slug under different parents. So a
        // candidate only counts when its permalink path round-trips to the
        // crawl URL's path — anything else stays unmapped (shown copy-only)
        // instead of risking a fix written onto the wrong post.
        $segments = array_values( array_filter( explode( '/', $path ) ) );
        $slug     = rawurldecode( (string) end( $segments ) );
        if ( $slug === '' || $query !== '' ) {
            return 0;
        }
        $crawl_path = strtolower( trim( rawurldecode( $path ), '/' ) );
        $candidates = get_posts( [
            'name'        => $slug,
            'post_type'   => [ 'post', 'page' ],
            'post_status' => 'publish',
            'numberposts' => 5,
            'fields'      => 'ids',
        ] );
        foreach ( $candidates as $candidate_id ) {
            $permalink_path = strtolower( trim( rawurldecode(
                (string) wp_parse_url( get_permalink( (int) $candidate_id ), PHP_URL_PATH )
            ), '/' ) );
            if ( $permalink_path !== '' && $permalink_path === $crawl_path ) {
                return (int) $candidate_id;
            }
        }
        return 0;
    }

}
