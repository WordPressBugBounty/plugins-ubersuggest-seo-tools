<?php
defined( 'ABSPATH' ) || exit;

/**
 * Per-page SEO meta the plugin manages: a <meta name="description"> tag and an
 * optional document <title> override, stored in post meta.
 *
 * Stands down entirely when a dedicated SEO plugin (Yoast / Rank Math) is
 * active, so we never emit duplicate tags.
 */
class UBS_SEO_Meta {

    public const META_DESC  = '_ubs_meta_description';
    public const META_TITLE = '_ubs_seo_title';

    // Site-level homepage meta: a blog-index homepage has no post to attach to.
    public const HOME_TITLE_OPTION = 'ubs_seo_home_title';
    public const HOME_DESC_OPTION  = 'ubs_seo_home_description';

    public const TITLE_MAX = 60;
    public const TITLE_MIN = 30;

    public static function conflicting_seo_plugin(): ?string {
        if ( defined( 'WPSEO_VERSION' ) ) {
            return 'Yoast SEO';
        }
        if ( defined( 'RANK_MATH_VERSION' ) ) {
            return 'Rank Math';
        }
        return null;
    }

    public function register(): void {
        // Let a dedicated SEO plugin own meta output if present.
        if ( self::conflicting_seo_plugin() !== null ) {
            return;
        }
        add_action( 'wp_head', [ $this, 'output_description' ], 1 );
        add_filter( 'pre_get_document_title', [ $this, 'filter_title' ], 20 );
    }

    public function output_description(): void {
        $desc = $this->current_description();
        if ( $desc === '' ) {
            return;
        }
        echo '<meta name="description" content="' . esc_attr( $desc ) . '" />' . "\n";
    }

    /**
     * @param string $title
     * @return string
     */
    public function filter_title( $title ) {
        if ( self::is_blog_index_home() ) {
            $home = (string) get_option( self::HOME_TITLE_OPTION, '' );
            return $home !== '' ? $home : $title;
        }
        if ( ! is_singular() ) {
            return $title;
        }
        $seo = (string) get_post_meta( get_queried_object_id(), self::META_TITLE, true );
        return $seo !== '' ? $seo : $title;
    }

    /** The description for the page being rendered ('' when we manage none). */
    private function current_description(): string {
        if ( self::is_blog_index_home() ) {
            return (string) get_option( self::HOME_DESC_OPTION, '' );
        }
        if ( ! is_singular() ) {
            return '';
        }
        return (string) get_post_meta( get_queried_object_id(), self::META_DESC, true );
    }

    /**
     * True on a homepage that lists the latest posts (Settings → Reading), i.e.
     * the front page has no post behind it — its SEO meta is site-level.
     *
     * Page 1 only: is_front_page() && is_home() stays true on /page/2/…, and
     * emitting the same title/description there discards core's "Page N"
     * differentiator and hands the next crawl N identical pages — the plugin
     * would be manufacturing the duplicate-title/description issues it reports.
     */
    public static function is_blog_index_home(): bool {
        return is_front_page() && is_home() && ! is_paged();
    }

    /**
     * Config-side twin of is_blog_index_home() for REST/admin contexts, where
     * there is no main query to ask. True when the front page is configured to
     * list posts. Deliberately false for a MISCONFIGURED static front page
     * (show_on_front=page with page_on_front=0): is_front_page() is false
     * there, so home meta written under that state would never be output —
     * claiming the homepage as fixable would be a write that reports success
     * and renders nothing.
     */
    public static function blog_index_home_configured(): bool {
        return get_option( 'show_on_front' ) !== 'page';
    }

}
