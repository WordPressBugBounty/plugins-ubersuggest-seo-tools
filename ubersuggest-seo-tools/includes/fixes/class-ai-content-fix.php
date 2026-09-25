<?php
defined( 'ABSPATH' ) || exit;

/**
 * Shared base for fixes whose remedy is a piece of generated text (a meta
 * description, a title, an H1) applied to each affected page. WHICH pages are
 * affected comes from the backend crawl's per-issue breakdown (single source
 * of truth, 1:1 with the Ubersuggest app); the suggested text comes from the
 * UBS backend AI via {@see UBS_SEO_Suggestions}. Subclasses only declare how
 * to read the current value and how to store the new one.
 */
abstract class UBS_SEO_AI_Content_Fix implements UBS_SEO_Targeted_Fix {

    // Which pages are in scope, the homepage as a target, the audit trail and
    // the preview rows each live in their own file; what stays here is the
    // contract subclasses implement plus the apply() algorithm itself.
    use UBS_SEO_Crawl_Target_Pages;
    use UBS_SEO_Home_Target_Meta;
    use UBS_SEO_Fix_History_Recording;
    use UBS_SEO_Fix_Preview_Rows;
    use UBS_SEO_Fix_Status_Report;

    /** Ref used for the site homepage, which has no post id behind it. */
    /** Alias of the log's own sentinel; see UBS_SEO_Fix_History::HOME_REF. */
    public const HOME_REF = UBS_SEO_Fix_History::HOME_REF;

    /** Value shown in the preview "before" column for a page. */
    abstract protected function before_value( WP_Post $post ): string;

    /** History `field` this fix writes: 'title' | 'description' | 'h1'. */
    abstract protected function field(): string;

    /**
     * The STORED value before the write — what a revert restores ('' = no
     * override). Distinct from before_value(): a title's displayed "before" is
     * the rendered fallback, but reverting must clear back to the empty
     * override, not freeze the fallback in. Abstract on purpose: a wrong
     * default here silently corrupts the revert path of any new fix.
     */
    abstract protected function raw_value( WP_Post $post ): string;

    /** The stored site-level home value before the write (templates included). */
    abstract protected function home_raw_value(): string;

    /** What carries the write: the active SEO store, or 'content' for content edits. */
    protected function integration_name(): string {
        return UBS_SEO_Meta_Stores::active()->name();
    }

    /** The value now on the page — what an already-fixed card shows as done. */
    protected function live_value( WP_Post $post ): string {
        return $this->before_value( $post );
    }

    /** Persist the chosen value onto the page. */
    abstract protected function store( WP_Post $post, string $value ): void;

    abstract protected function ok_message(): string;

    /** @param int $count number of affected pages */
    abstract protected function fixable_message( int $count ): string;

    /** SEO plugin we should stand down behind, or null if we never conflict. */
    protected function conflicting_plugin(): ?string {
        return null;
    }

    // Approved-values plumbing shared by targeted fixes. Using the approved
    // values keeps what we write identical to what the preview showed, and
    // avoids a second backend call (and its credit charge).
    use UBS_SEO_Targeted_Apply_Helpers;

    /**
     * The value to write for a page: exactly what the user approved in the
     * preview. Empty when they approved nothing for it — apply() then skips
     * the page ('no_value') instead of generating behind their back, so an
     * apply can never write text the user hasn't reviewed (or be charged for
     * a fresh generation).
     */
    protected function approved_value( WP_Post $post ): string {
        $value = $this->approved_values[ (string) $post->ID ] ?? '';
        return is_string( $value ) ? $value : '';
    }

    public function apply() {
        $owner = $this->conflicting_plugin();
        if ( $owner !== null ) {
            return new WP_Error(
                'ubs_seo_conflict',
                /* translators: %s: name of the conflicting SEO plugin, e.g. "Yoast SEO". */
                sprintf( __( 'Another SEO plugin (%s) is managing this.', 'ubersuggest-seo-tools' ), $owner )
            );
        }
        // Write only the pages the user approved in the preview, so applying one
        // page never touches (or regenerates) the others. With no approved values
        // there is nothing reviewed to write — every page skips as 'no_value'.
        $this->reset_applied_refs();
        $this->begin_history_session();
        $this->skipped = [];
        foreach ( $this->resolve_targets( $this->target_ids() ) as $id ) {
            $post = get_post( (int) $id );
            if ( ! $post instanceof WP_Post ) {
                $this->skipped[ (string) $id ] = 'missing_post';
                continue;
            }
            // Re-check against the LIVE value before writing: the crawl list can
            // be older than a manual edit (the user fixed the page by hand, or
            // another tool did), and we must never overwrite a page that is no
            // longer broken with a generated suggestion.
            if ( ! $this->still_broken( $post ) ) {
                $this->skipped[ (string) $id ] = 'not_broken';
                continue;
            }
            $value = $this->approved_value( $post );
            if ( $value === '' ) {
                $this->skipped[ (string) $id ] = 'no_value';
                continue;
            }
            // No history record, no write: the row is the only copy of the
            // previous value, so an unrecorded overwrite is unrecoverable.
            $record_id = $this->record_post_write( $post, $value );
            if ( $record_id === 0 ) {
                $this->skipped[ (string) $id ] = 'history_failed';
                continue;
            }
            $this->store( $post, $value );
            // SEO-plugin sanitizers may normalize on write; the record must
            // hold what the field actually holds or Undo never matches.
            $stored = $this->raw_value( $post );
            if ( $stored !== $value ) {
                UBS_SEO_Fix_History::update_applied_value( $record_id, $stored );
            }
            $this->record_applied_ref( (int) $id );
        }

        $this->apply_home();
        return true;
    }

    /**
     * Whether $post STILL has this issue right now (live check), independent of
     * the crawl list. Guards apply() from overwriting a page fixed since the
     * crawl. Default true (unknown → let the crawl decide); subclasses override
     * with the concrete check.
     */
    protected function still_broken( WP_Post $post ): bool {
        return true;
    }

}
