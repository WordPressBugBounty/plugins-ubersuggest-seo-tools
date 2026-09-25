<?php
defined( 'ABSPATH' ) || exit;

/**
 * Fix: add a missing H1 heading (issue `absent_h1_tags`).
 *
 * Edits post content: the suggested H1 is prepended as a heading block after
 * the user reviews it in the preview. Does not stand down behind another SEO
 * plugin because those manage <title>/meta, not the page's H1.
 */
class UBS_SEO_H1_Fix extends UBS_SEO_AI_Content_Fix {

    public function issue_id(): string {
        return 'absent_h1_tags';
    }

    protected function field(): string {
        return 'h1';
    }

    // Written into post content, not through an SEO plugin's store — the
    // history must say so, or a revert would try the wrong path.
    protected function integration_name(): string {
        return 'content';
    }

    /** No stored field — the fix adds a content block. */
    protected function raw_value( WP_Post $post ): string {
        return '';
    }

    protected function home_raw_value(): string {
        return '';
    }

    protected function before_value( WP_Post $post ): string {
        return ''; // no H1 today
    }

    /** Unused: apply() is overridden to prepend a content block. */
    protected function store( WP_Post $post, string $value ): void {}

    protected function ok_message(): string {
        return __( 'Every page has an H1 heading.', 'ubersuggest-seo-tools' );
    }

    protected function fixable_message( int $count ): string {
        /* translators: %d: number of pages */
        return sprintf( _n( '%d page is missing an H1 heading.', '%d pages are missing an H1 heading.', $count, 'ubersuggest-seo-tools' ), $count );
    }

    public function apply() {
        // Only the pages the user approved (per-card Apply), or every affected
        // page on a direct apply; never a page that has an H1 right now (the
        // crawl list can be older than a manual edit — re-check before writing).
        $this->reset_applied_refs();
        $this->begin_history_session();
        $this->skipped = [];
        foreach ( $this->resolve_targets( $this->target_ids() ) as $id ) {
            $post = get_post( $id );
            if ( ! $post instanceof WP_Post ) {
                $this->skipped[ (string) $id ] = 'missing_post';
                continue;
            }
            if ( ! $this->still_broken( $post ) ) {
                $this->skipped[ (string) $id ] = 'not_broken';
                continue;
            }
            $heading_text = $this->approved_value( $post );
            if ( $heading_text === '' ) {
                $this->skipped[ (string) $id ] = 'no_value';
                continue;
            }
            // The record stores the heading TEXT (readable in the history diff);
            // revert rebuilds the exact block from it and removes that.
            $record_id = $this->record_post_write( $post, $heading_text );
            if ( $record_id === 0 ) {
                $this->skipped[ (string) $id ] = 'history_failed';
                continue;
            }
            // wp_slash: wp_update_post unslashes, which would strip backslashes
            // from the whole post body, not just the prepended block.
            $updated = wp_update_post(
                [ 'ID' => $id, 'post_content' => wp_slash( self::heading_block( $heading_text ) . $post->post_content ) ],
                true
            );
            // A refused write (another plugin's wp_insert_post_data filter, a
            // post lock, a DB error) must never be reported as a fix: the card
            // would turn green and the issue count move over a page that still
            // has no H1. Drop the row we just wrote — it claims a heading that
            // isn't there — and skip the page.
            if ( is_wp_error( $updated ) || (int) $updated === 0 || ! $this->has_h1( get_post( $id ) ) ) {
                UBS_SEO_Fix_History::delete_record( $record_id );
                $this->skipped[ (string) $id ] = 'write_failed';
                continue;
            }
            $this->record_applied_ref( (int) $id );
        }
        return true;
    }

    /**
     * The exact Gutenberg block apply() prepends for a heading text. Static and
     * deterministic on purpose: revert rebuilds the block from the recorded
     * text and removes THAT — byte-identical or it refuses to touch the content.
     */
    public static function heading_block( string $heading_text ): string {
        return '<!-- wp:heading {"level":1} -->' . "\n"
            . '<h1>' . esc_html( $heading_text ) . '</h1>' . "\n"
            . '<!-- /wp:heading -->' . "\n\n";
    }

    // "Still holds our value" for content: the exact prepended block survives.
    protected function holds_applied_value( string $ref, string $applied_value ): bool {
        // Guard, not dead code: (int) 'home' is 0, and get_post(0) resolves to
        // the global $post — an unrelated page. H1 never writes home meta.
        if ( $ref === self::HOME_REF ) {
            return false;
        }
        $post = get_post( (int) $ref );
        return $post instanceof WP_Post
            && str_contains( (string) $post->post_content, self::heading_block( $applied_value ) );
    }

    protected function still_broken( WP_Post $post ): bool {
        return ! $this->has_h1( $post );
    }

    private function has_h1( ?WP_Post $post ): bool {
        if ( ! $post instanceof WP_Post ) {
            return true; // can't inspect → don't offer a fix
        }
        return (bool) preg_match( '/<h1[\s>]/i', (string) $post->post_content );
    }
}
