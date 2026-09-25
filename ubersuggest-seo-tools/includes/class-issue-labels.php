<?php
defined( 'ABSPATH' ) || exit;

/**
 * Human-readable labels for Site Audit issue IDs.
 *
 * Sourced from the Ubersuggest web app's `issue_name_*` strings so the plugin
 * dashboard uses the same wording. Unknown IDs fall back to a humanized slug.
 *
 * FALLBACK ONLY on screen. These are English (the plugin ships no `.mo` files,
 * and PHP's locale isn't the one the React app boots with), so the UI translates
 * from the issue ID instead — see src/i18n/issue-text.ts. A label reaching the
 * user means the catalog had no string for that ID.
 */
class UBS_SEO_Issue_Labels {

    /** @return array<string,string> */
    private static function map(): array {
        return [
            'absent_doctype'                       => __( 'No doctype declared', 'ubersuggest-seo-tools' ),
            'absent_encoding_meta_tag'             => __( 'No character encoding declared', 'ubersuggest-seo-tools' ),
            'absent_h1_tags'                       => __( 'No H1 tag', 'ubersuggest-seo-tools' ),
            'compression_disabled'                 => __( 'No content compression enabled', 'ubersuggest-seo-tools' ),
            'content_count_words'                  => __( 'Low word count', 'ubersuggest-seo-tools' ),
            'duplicate_meta_description_tags'      => __( 'Multiple meta descriptions on the same page', 'ubersuggest-seo-tools' ),
            'duplicate_meta_descriptions'          => __( 'Duplicate meta descriptions', 'ubersuggest-seo-tools' ),
            'have_broken_links_anchor'             => __( 'Broken links', 'ubersuggest-seo-tools' ),
            'have_sitemap'                         => __( 'No sitemap', 'ubersuggest-seo-tools' ),
            'have_title_duplicates'                => __( 'Duplicate title tags', 'ubersuggest-seo-tools' ),
            'meta_description_empty'               => __( 'No meta description', 'ubersuggest-seo-tools' ),
            'page_allowed'                         => __( 'Blocked from appearing in search engines', 'ubersuggest-seo-tools' ),
            'pages_with_flash'                     => __( 'Flash is being used', 'ubersuggest-seo-tools' ),
            'response_code_4xx'                    => __( 'Page returned 4xx status code', 'ubersuggest-seo-tools' ),
            'seo_friendly_url_relative_length_check' => __( 'URL too long', 'ubersuggest-seo-tools' ),
            'seo_non_friendly_url'                 => __( 'Poorly formatted URL for SEO', 'ubersuggest-seo-tools' ),
            'ssl_certificate_expiration'           => __( 'SSL certificate about to expire', 'ubersuggest-seo-tools' ),
            'ssl_certificate_valid'                => __( 'No valid SSL certificate', 'ubersuggest-seo-tools' ),
            'temporary_redirects'                  => __( 'Temporary redirects exist', 'ubersuggest-seo-tools' ),
            'time_load_high'                       => __( 'Long load time', 'ubersuggest-seo-tools' ),
            'title_duplicate_tag'                  => __( 'Multiple title tags on the same page', 'ubersuggest-seo-tools' ),
            'title_empty'                          => __( 'No title tag', 'ubersuggest-seo-tools' ),
            'title_long'                           => __( 'Title tag too long', 'ubersuggest-seo-tools' ),
            'title_short'                          => __( 'Title tag too short', 'ubersuggest-seo-tools' ),
        ];
    }

    public static function label( string $id ): string {
        $map = self::map();
        if ( isset( $map[ $id ] ) ) {
            return $map[ $id ];
        }
        return ucfirst( str_replace( '_', ' ', $id ) );
    }
}
