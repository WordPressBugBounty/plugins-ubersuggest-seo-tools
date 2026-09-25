<?php
defined( 'ABSPATH' ) || exit;

/**
 * URL and ref plumbing: normalizing for comparison, recognizing this site's
 * root, and reducing any ref to the domain-relative path the backend wants.
 */
trait UBS_SEO_Audit_Urls {

    /**
     * Build an absolute URL on THIS site's origin for a domain-relative path.
     *
     * Uses home_url()'s scheme, host and port rather than audit_domain(), which
     * lowercases and strips `www.` and carries no port — a synthesized
     * `http://localhost/x` would neither open nor match a local permalink on a
     * wp-env site running at localhost:8888.
     */
    private static function local_url_for_path( string $path ): string {
        $home = wp_parse_url( home_url() );
        $host = (string) ( $home['host'] ?? '' );
        if ( $host === '' ) {
            return '';
        }
        return ( $home['scheme'] ?? 'https' ) . '://' . $host
            . ( isset( $home['port'] ) ? ':' . $home['port'] : '' )
            . '/' . ltrim( $path, '/' );
    }

    /** Compare URLs ignoring scheme and a trailing slash. */
    public static function normalize_url( string $url ): string {
        return rtrim( preg_replace( '#^https?://#i', '', strtolower( $url ) ), '/' );
    }

    /**
     * Whether $url is THIS site's root (the homepage).
     *
     * Three checks, each guarding a real failure:
     * - host must match home_url()'s host (tolerating only the www. variant a
     *   crawler may follow) — a host-blind match would let a foreign root URL
     *   in a breakdown drive site-level meta writes on OUR homepage;
     * - path must match home_url()'s own path, not just be empty — on a
     *   subdirectory install the root lives at /wp, and comparing against ''
     *   meant the homepage was never recognized there;
     * - no query string.
     */
    public static function is_site_root_url( string $url ): bool {
        $home      = wp_parse_url( home_url( '/' ) );
        $url_host  = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
        $home_host = strtolower( (string) ( $home['host'] ?? '' ) );
        if ( $url_host === '' || $home_host === '' ) {
            return false;
        }
        if ( preg_replace( '/^www\./', '', $url_host ) !== preg_replace( '/^www\./', '', $home_host ) ) {
            return false;
        }
        $url_path  = trim( (string) wp_parse_url( $url, PHP_URL_PATH ), '/' );
        $home_path = trim( (string) ( $home['path'] ?? '' ), '/' );
        return $url_path === $home_path
            && (string) wp_parse_url( $url, PHP_URL_QUERY ) === '';
    }

    /** Epoch seconds the last crawl completed, 0 when unknown. */
    public static function last_crawled_timestamp(): int {
        return (int) floor( (int) get_option( 'ubs_seo_last_crawled_ms', 0 ) / 1000 );
    }

    /**
     * The domain-relative path to re-crawl for one preview row's `ref`, or ''
     * when the row has no crawlable page behind it.
     *
     * Refs come in the three shapes the preview uses: a post id (fixable
     * issues), the 'home' sentinel, and a crawl URL (manual issues). All three
     * collapse to a path here, because that is all the backend's URL mode wants
     * — it rebuilds the absolute URL itself from `domain + path`, trying both
     * schemes and the www. variants, so the scheme and host we happen to know
     * locally are irrelevant and a mismatch between them and the audit domain
     * cannot break the crawl.
     */
    public static function page_path_for_ref( string $ref ): string {
        if ( $ref === 'home' ) {
            return '/';
        }
        // A post id: use the CURRENT permalink, never a stored one. A slug fix
        // moves the page, and re-crawling where it used to live would report the
        // fix as broken (404) instead of verifying it.
        if ( ctype_digit( $ref ) ) {
            $permalink = get_permalink( (int) $ref );
            if ( ! is_string( $permalink ) || $permalink === '' ) {
                return '';
            }
            return self::path_of( $permalink );
        }
        return self::path_of( $ref );
    }

    /**
     * A URL's domain-relative path, '/' for a site root. Query strings are
     * dropped: the backend's own normalize_path splits on '&' rather than '?',
     * so a path carrying one would reach the crawler intact and key a report
     * nothing else can find again.
     */
    private static function path_of( string $url ): string {
        if ( self::is_site_root_url( $url ) ) {
            return '/';
        }
        $path = (string) wp_parse_url( $url, PHP_URL_PATH );
        return $path === '' ? '/' : $path;
    }

}
