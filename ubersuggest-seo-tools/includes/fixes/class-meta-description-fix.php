<?php
defined( 'ABSPATH' ) || exit;

/**
 * Fix: give pages a meta description (issue `meta_description_empty`). Reads and
 * writes through the active SEO plugin's store (Yoast / Rank Math / native), so
 * it works on a site running one of those instead of standing down.
 */
class UBS_SEO_Meta_Description_Fix extends UBS_SEO_AI_Content_Fix {

    public function issue_id(): string {
        return 'meta_description_empty';
    }

    protected function field(): string {
        return 'description';
    }

    protected function before_value( WP_Post $post ): string {
        return '';
    }

    protected function raw_value( WP_Post $post ): string {
        return UBS_SEO_Meta_Stores::active()->get_description( $post->ID );
    }

    protected function home_raw_value(): string {
        return UBS_SEO_Meta_Stores::active()->get_home_description();
    }

    protected function store( WP_Post $post, string $value ): void {
        UBS_SEO_Meta_Stores::active()->set_description( $post->ID, $value );
    }

    // before_value is always '' here (empty IS the issue), so the fixed card
    // reads the applied description from the store instead.
    protected function live_value( WP_Post $post ): string {
        return UBS_SEO_Meta_Stores::active()->get_description( $post->ID );
    }

    protected function ok_message(): string {
        return __( 'Every page has a meta description.', 'ubersuggest-seo-tools' );
    }

    protected function fixable_message( int $count ): string {
        /* translators: %d: number of pages */
        return sprintf( _n( '%d page has no meta description.', '%d pages have no meta description.', $count, 'ubersuggest-seo-tools' ), $count );
    }

    protected function still_broken( WP_Post $post ): bool {
        return UBS_SEO_Meta_Stores::active()->get_description( $post->ID ) === '';
    }

    // The homepage's meta description is a site-level setting when the front
    // page is the blog index — writable through the active store.
    protected function supports_home(): bool {
        return true;
    }

    protected function home_before_value(): string {
        return $this->displayable_home_value(
            UBS_SEO_Meta_Stores::active()->get_home_description()
        );
    }

    protected function store_home( string $value ): void {
        UBS_SEO_Meta_Stores::active()->set_home_description( $value );
    }

    /**
     * Template-aware, like the title fixes: a stored description TEMPLATE is
     * what the crawler flagged, not a fix. Overridden because the base default
     * tests home_before_value(), which now renders templates for display and
     * would read a rendered non-empty template as "fixed".
     */
    protected function home_still_broken(): bool {
        $current = UBS_SEO_Meta_Stores::active()->get_home_description();
        return $current === '' || $this->is_template_value( $current );
    }
}
