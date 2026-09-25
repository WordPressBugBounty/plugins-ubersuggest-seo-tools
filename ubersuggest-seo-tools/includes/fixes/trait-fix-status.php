<?php
defined( 'ABSPATH' ) || exit;

/**
 * What state an issue is in and what the last apply left behind: the
 * fixable/manual/ok verdict the list renders, whether every flagged page is
 * clean again, and the per-ref reasons a write was skipped.
 */
trait UBS_SEO_Fix_Status_Report {

    /**
     * True when EVERY page the crawl flagged is now clean locally — i.e. the
     * user has applied the fix to all of them and there's nothing left this
     * plugin can fix. Drives the "applied → Fixed tab, awaiting recrawl" state:
     * a live re-check, NOT the persistent applied record, so a PARTIAL apply
     * (some pages still broken) or a re-flagged issue never counts as resolved.
     * Any unmapped URL (a flagged page we can't edit) or a failed fetch means
     * not resolved.
     */
    public function targets_resolved(): bool {
        $pages = UBS_SEO_Audit_Service::breakdown_pages( $this->issue_id() );
        if ( ! empty( $pages['failed'] ) || $this->unmapped_urls() !== [] ) {
            return false;
        }
        foreach ( $pages['ids'] as $id ) {
            $post = get_post( (int) $id );
            if ( $post instanceof WP_Post && $this->still_broken( $post ) ) {
                return false;
            }
        }
        $home = $this->home_target();
        if ( $home !== '' && $this->home_still_broken() ) {
            return false;
        }
        // Nothing flagged at all → let status()'s 'ok' handle it.
        return $pages['ids'] !== [] || $home !== '';
    }

    /** @var array<string,string> refs apply() skipped, keyed by ref → reason */
    protected array $skipped = [];

    /** Why apply() skipped each requested-but-unwritten ref (diagnostics). */
    public function skipped_refs(): array {
        return $this->skipped;
    }

    public function status(): array {
        $owner = $this->conflicting_plugin();
        if ( $owner !== null ) {
            /* translators: %s: name of the SEO plugin that owns this setting, e.g. "Yoast SEO". */
            return [ 'state' => 'manual', 'message' => sprintf( __( '%s is managing this.', 'ubersuggest-seo-tools' ), $owner ) ];
        }
        $pages = UBS_SEO_Audit_Service::breakdown_pages( $this->issue_id() );
        if ( ! empty( $pages['failed'] ) ) {
            // The breakdown fetch failed — never report 'ok' (that would falsely
            // confirm the issue as fixed). Keep it actionable; the next render
            // retries the fetch.
            return [ 'state' => 'fixable', 'message' => __( 'Could not load the affected pages — try again.', 'ubersuggest-seo-tools' ) ];
        }
        // Pages we can actually write: mapped posts, plus the homepage when its
        // meta is site-level and this fix owns it.
        $copy_only  = $this->unmapped_urls();
        $writable   = count( $pages['ids'] ) + ( $this->home_target() !== '' ? 1 : 0 );
        $affected   = $writable + count( $copy_only );
        if ( $writable === 0 ) {
            // The crawl still flags pages, but none map to something we can
            // write — there's nothing to apply, only suggestions to copy.
            if ( $affected > 0 ) {
                return [ 'state' => 'manual', 'message' => $this->fixable_message( $affected ) ];
            }
            return [ 'state' => 'ok', 'message' => $this->ok_message() ];
        }
        return [ 'state' => 'fixable', 'message' => $this->fixable_message( $affected ) ];
    }

}
