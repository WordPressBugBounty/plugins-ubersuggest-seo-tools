<?php
defined( 'ABSPATH' ) || exit;

/**
 * Base for the title issues. All three apply via the active SEO plugin's title
 * override (post content is untouched; only the <title> tag changes), so they
 * work on a site running Yoast / Rank Math instead of standing down. Subclasses
 * differ only in which pages they target.
 */
abstract class UBS_SEO_Title_Fix extends UBS_SEO_AI_Content_Fix {

    protected function field(): string {
        return 'title';
    }

    protected function before_value( WP_Post $post ): string {
        return $this->effective_title( $post->ID );
    }

    // The stored OVERRIDE, not the effective title: reverting a title fix must
    // clear back to "no override" (the theme's fallback), never freeze the
    // fallback in as an override.
    protected function raw_value( WP_Post $post ): string {
        return UBS_SEO_Meta_Stores::active()->get_title( $post->ID );
    }

    protected function home_raw_value(): string {
        return UBS_SEO_Meta_Stores::active()->get_home_title();
    }

    protected function store( WP_Post $post, string $value ): void {
        UBS_SEO_Meta_Stores::active()->set_title( $post->ID, $value );
    }

    /** Title actually emitted: the active store's override if set, else the post title. */
    protected function effective_title( int $id ): string {
        $seo_title = UBS_SEO_Meta_Stores::active()->get_title( $id );
        return $seo_title !== '' ? $seo_title : (string) get_the_title( $id );
    }

    /** Whether the title this class polices is out of spec (runs on the effective title). */
    abstract protected function title_flagged( string $title ): bool;

    protected function still_broken( WP_Post $post ): bool {
        if ( $this->title_flagged( $this->effective_title( $post->ID ) ) ) {
            return true;
        }
        // An explicit SEO-title override replaces the rendered <title> outright,
        // so an in-spec override means fixed — crucially including the one
        // apply() itself just wrote. store() goes through update_post_meta,
        // which never bumps post_modified, so the edit-time heuristic below can
        // never see our own fix: without this check an applied title stayed
        // "broken" forever and the issue could never leave the To-fix tab.
        if ( UBS_SEO_Meta_Stores::active()->get_title( $post->ID ) !== '' ) {
            return false;
        }
        // No override: the crawler flagged the RENDERED <title> (themes append
        // "… – Site Name"), which we can't reproduce locally. Only an edit made
        // after the crawl counts as fixed; otherwise the crawl's flag stands
        // and apply may write the reviewed suggestion.
        return ! $this->modified_since_crawl( $post );
    }

    // The homepage's title is a site-level setting when the front page is the
    // blog index — writable through the active store.
    protected function supports_home(): bool {
        return true;
    }

    protected function home_before_value(): string {
        return $this->displayable_home_value(
            UBS_SEO_Meta_Stores::active()->get_home_title()
        );
    }

    protected function store_home( string $value ): void {
        UBS_SEO_Meta_Stores::active()->set_home_title( $value );
    }

    /**
     * Only a CONCRETE override counts as fixed (including the one apply just
     * wrote). Yoast/Rank Math ship a non-empty template as the home-title
     * default, so testing for '' alone made apply skip with 'not_broken' on
     * every Yoast site — the user clicked Apply and nothing happened.
     */
    protected function home_still_broken(): bool {
        $current = UBS_SEO_Meta_Stores::active()->get_home_title();
        return $current === '' || $this->is_template_value( $current );
    }
}
