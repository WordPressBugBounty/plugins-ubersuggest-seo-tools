<?php
defined( 'ABSPATH' ) || exit;

/**
 * The site homepage as a fix target. A blog-index front page has no post
 * behind it, so its title/description live in site-level settings: this holds
 * the plumbing for reading, displaying and writing that value. Subclasses
 * still declare whether they own it (supports_home) and how to read/store it.
 */
trait UBS_SEO_Home_Target_Meta {

    /**
     * The crawl-flagged homepage URL when this fix CAN write it, else ''.
     *
     * A blog-index homepage (Settings → Reading = "Your latest posts") has no
     * post behind it, so its title/description live in site-level settings.
     * Without this the most important page on the site would be copy-only.
     */
    protected function home_target(): string {
        if ( ! $this->supports_home() ) {
            return '';
        }
        return (string) ( UBS_SEO_Audit_Service::breakdown_pages( $this->issue_id() )['home'] ?? '' );
    }

    /** Whether this fix can write the site-level homepage meta. */
    protected function supports_home(): bool {
        return false;
    }

    /** Current site-level homepage value ('' when none is set). */
    protected function home_before_value(): string {
        return '';
    }

    /** Persist $value as the site-level homepage meta. */
    protected function store_home( string $value ): void {}

    /**
     * Whether a stored home value is an SEO plugin's TEMPLATE rather than a
     * concrete title/description. Yoast ships '%%sitename%% %%page%% …' as its
     * home-title default and persists it, Rank Math '%sitename% %page% …' —
     * so "non-empty" can never mean "already fixed" for the homepage: the
     * template's rendering is exactly what the crawler flagged.
     */
    protected function is_template_value( string $value ): bool {
        return (bool) preg_match( '/%{1,2}[A-Za-z0-9_]+%{1,2}/', $value );
    }

    /**
     * A home value fit for the preview's "before" column: concrete values pass
     * through; a template is rendered when its owner can do so (Yoast exposes
     * wpseo_replace_vars), else hidden — showing raw '%%sitename%%…' to an end
     * user reads as garbage, and '' renders as "(none)".
     */
    protected function displayable_home_value( string $value ): string {
        if ( ! $this->is_template_value( $value ) ) {
            return $value;
        }
        if ( function_exists( 'wpseo_replace_vars' ) ) {
            return (string) wpseo_replace_vars( $value, [] );
        }
        return '';
    }

    /**
     * Write the homepage's site-level meta when the crawl flagged it and the
     * user approved a value for it (or on a direct apply with no preview, the
     * suggestion already cached server-side — apply never charges for a fresh
     * generation).
     */
    private function apply_home(): void {
        $home_url = $this->home_target();
        if ( $home_url === '' ) {
            return;
        }
        $approved = $this->approved_values();
        // Per-card apply: only touch the homepage when it was one of the cards.
        if ( $approved !== [] && ! isset( $approved[ self::HOME_REF ] ) ) {
            return;
        }
        if ( ! $this->home_still_broken() ) {
            $this->skipped[ self::HOME_REF ] = 'not_broken';
            return;
        }
        $value = (string) ( $approved[ self::HOME_REF ] ?? '' );
        if ( $value === '' ) {
            // Direct apply: reuse the cached suggestion; 'status' never charges.
            $cached = UBS_SEO_Suggestions::for_url_async( $this->issue_id(), $home_url, 'status' );
            $value  = (string) ( $cached['suggestion'] ?? '' );
        }
        if ( $value === '' ) {
            $this->skipped[ self::HOME_REF ] = 'no_value';
            return;
        }
        $record_id = $this->record_home_write( $home_url, $value );
        if ( $record_id === 0 ) {
            $this->skipped[ self::HOME_REF ] = 'history_failed';
            return;
        }
        $this->store_home( $value );
        $stored = $this->home_raw_value();
        if ( $stored !== $value ) {
            UBS_SEO_Fix_History::update_applied_value( $record_id, $stored );
        }
        $this->record_applied_ref( self::HOME_REF );
    }

    /**
     * Whether the homepage still has this issue. Site-level meta has no
     * post_modified to compare against, so an existing value means fixed.
     */
    protected function home_still_broken(): bool {
        return $this->home_before_value() === '';
    }

}
