<?php
defined( 'ABSPATH' ) || exit;

/**
 * Where a page's SEO title + meta description actually live. WordPress has no
 * canonical storage for them — each SEO plugin keeps its own post meta — so a
 * fix has to read/write through whichever plugin is active, or it silently has
 * no effect (the active plugin's value wins on output).
 *
 * This abstracts that decision behind one interface:
 *   - Yoast SEO → _yoast_wpseo_title / _yoast_wpseo_metadesc
 *   - Rank Math → rank_math_title / rank_math_description
 *   - neither   → our own keys, emitted by {@see UBS_SEO_Meta}
 *
 * Detection and applying both go through the active store, so the title/meta
 * fixes work on a site running Yoast or Rank Math instead of standing down.
 */
interface UBS_SEO_Meta_Store {

    /** Human-readable owner, e.g. 'Yoast SEO' | 'Rank Math' | 'native'. */
    public function name(): string;

    /** The SEO title override for a post ('' when none is set). */
    public function get_title( int $post_id ): string;

    public function set_title( int $post_id, string $value ): void;

    /** The meta description for a post ('' when none is set). */
    public function get_description( int $post_id ): string;

    public function set_description( int $post_id, string $value ): void;

    /**
     * The site homepage's title/description. A blog-index homepage (Settings →
     * Reading = "Your latest posts") has NO post behind it, so its SEO meta
     * lives in site-level settings, not post meta — each SEO plugin keeps its
     * own. Without these, the most important page on the site is unfixable.
     */
    public function get_home_title(): string;

    public function set_home_title( string $value ): void;

    public function get_home_description(): string;

    public function set_home_description( string $value ): void;
}

/** Our own meta keys, output by UBS_SEO_Meta when no SEO plugin is active. */
class UBS_SEO_Native_Meta_Store implements UBS_SEO_Meta_Store {

    public function name(): string {
        return 'native';
    }

    public function get_title( int $post_id ): string {
        return (string) get_post_meta( $post_id, UBS_SEO_Meta::META_TITLE, true );
    }

    // wp_slash on every post-meta write: update_post_meta unslashes its input,
    // so without it a value containing backslashes is stored corrupted — and the
    // fix history's byte-exact record would never match the field again.
    public function set_title( int $post_id, string $value ): void {
        update_post_meta( $post_id, UBS_SEO_Meta::META_TITLE, wp_slash( $value ) );
    }

    public function get_description( int $post_id ): string {
        return (string) get_post_meta( $post_id, UBS_SEO_Meta::META_DESC, true );
    }

    public function set_description( int $post_id, string $value ): void {
        update_post_meta( $post_id, UBS_SEO_Meta::META_DESC, wp_slash( $value ) );
    }

    public function get_home_title(): string {
        return (string) get_option( UBS_SEO_Meta::HOME_TITLE_OPTION, '' );
    }

    public function set_home_title( string $value ): void {
        update_option( UBS_SEO_Meta::HOME_TITLE_OPTION, $value );
    }

    public function get_home_description(): string {
        return (string) get_option( UBS_SEO_Meta::HOME_DESC_OPTION, '' );
    }

    public function set_home_description( string $value ): void {
        update_option( UBS_SEO_Meta::HOME_DESC_OPTION, $value );
    }
}

/** Yoast SEO's post-meta keys. */
class UBS_SEO_Yoast_Meta_Store implements UBS_SEO_Meta_Store {

    public function name(): string {
        return 'Yoast SEO';
    }

    public function get_title( int $post_id ): string {
        return (string) get_post_meta( $post_id, '_yoast_wpseo_title', true );
    }

    public function set_title( int $post_id, string $value ): void {
        update_post_meta( $post_id, '_yoast_wpseo_title', wp_slash( $value ) );
    }

    public function get_description( int $post_id ): string {
        return (string) get_post_meta( $post_id, '_yoast_wpseo_metadesc', true );
    }

    public function set_description( int $post_id, string $value ): void {
        update_post_meta( $post_id, '_yoast_wpseo_metadesc', wp_slash( $value ) );
    }

    // Yoast keeps the homepage title/description in its `wpseo_titles` option
    // (Yoast SEO → Settings → Homepage) when the front page is the blog index.
    public function get_home_title(): string {
        return $this->titles_option()['title-home-wpseo'] ?? '';
    }

    public function set_home_title( string $value ): void {
        $this->update_titles_option( 'title-home-wpseo', $value );
    }

    public function get_home_description(): string {
        return $this->titles_option()['metadesc-home-wpseo'] ?? '';
    }

    public function set_home_description( string $value ): void {
        $this->update_titles_option( 'metadesc-home-wpseo', $value );
    }

    /** @return array<string,string> */
    private function titles_option(): array {
        $option = get_option( 'wpseo_titles', [] );
        return is_array( $option ) ? $option : [];
    }

    private function update_titles_option( string $key, string $value ): void {
        $option         = $this->titles_option();
        $option[ $key ] = $value;
        // `wpseo_titles` is Yoast SEO's OWN option, not one of ours to prefix:
        // when Yoast owns the site's SEO meta, the homepage fix must write the
        // value where Yoast reads it, or the fix would never render. Read-merge-
        // write of one key; every option this plugin owns is ubs_seo_-prefixed.
        update_option( 'wpseo_titles', $option );
    }
}

/** Rank Math's post-meta keys. */
class UBS_SEO_RankMath_Meta_Store implements UBS_SEO_Meta_Store {

    public function name(): string {
        return 'Rank Math';
    }

    public function get_title( int $post_id ): string {
        return (string) get_post_meta( $post_id, 'rank_math_title', true );
    }

    public function set_title( int $post_id, string $value ): void {
        update_post_meta( $post_id, 'rank_math_title', wp_slash( $value ) );
    }

    public function get_description( int $post_id ): string {
        return (string) get_post_meta( $post_id, 'rank_math_description', true );
    }

    public function set_description( int $post_id, string $value ): void {
        update_post_meta( $post_id, 'rank_math_description', wp_slash( $value ) );
    }

    // Rank Math keeps the homepage title/description in its `rank_math_titles`
    // option (Rank Math → Titles & Meta → Homepage).
    public function get_home_title(): string {
        return $this->titles_option()['homepage_title'] ?? '';
    }

    public function set_home_title( string $value ): void {
        $this->update_titles_option( 'homepage_title', $value );
    }

    public function get_home_description(): string {
        return $this->titles_option()['homepage_description'] ?? '';
    }

    public function set_home_description( string $value ): void {
        $this->update_titles_option( 'homepage_description', $value );
    }

    /** @return array<string,string> */
    private function titles_option(): array {
        $option = get_option( 'rank_math_titles', [] );
        return is_array( $option ) ? $option : [];
    }

    private function update_titles_option( string $key, string $value ): void {
        $option         = $this->titles_option();
        $option[ $key ] = $value;
        // `rank_math_titles` is Rank Math's OWN option, not one of ours to
        // prefix — same integration contract as the Yoast store above.
        update_option( 'rank_math_titles', $option );
    }
}

/** Picks the meta store for the SEO plugin active on this site. */
class UBS_SEO_Meta_Stores {

    public static function active(): UBS_SEO_Meta_Store {
        if ( defined( 'WPSEO_VERSION' ) ) {
            return new UBS_SEO_Yoast_Meta_Store();
        }
        if ( defined( 'RANK_MATH_VERSION' ) ) {
            return new UBS_SEO_RankMath_Meta_Store();
        }
        return new UBS_SEO_Native_Meta_Store();
    }
}
