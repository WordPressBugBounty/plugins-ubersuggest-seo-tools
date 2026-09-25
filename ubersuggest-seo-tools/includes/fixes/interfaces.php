<?php
defined( 'ABSPATH' ) || exit;

/**
 * A "fix" is a remedy for a Site Audit issue that the plugin can apply from
 * inside WordPress. Fixes are only ever offered against issues the Site Audit
 * report actually flags — we never hunt for problems on our own. Each fix is
 * keyed by the Site Audit issue id it resolves.
 */
interface UBS_SEO_Fix {

    /** Site Audit issue id this fix resolves (e.g. "have_sitemap"). */
    public function issue_id(): string;

    /**
     * Current state of this fix on the live site.
     *
     * @return array{state:string, message:string}
     *   state: 'ok' (already fine) | 'fixable' (we can fix it now) | 'manual' (not our job)
     */
    public function status(): array;

    /**
     * Apply the fix to the live site.
     *
     * @return true|WP_Error
     */
    public function apply();
}

/**
 * A fix that applies to a SUBSET of the affected pages: the exact rows the
 * user approved in the preview (per-card Apply), including any values they
 * edited. apply() must then touch ONLY those pages — never the full target
 * scan — and must never write a value the user hasn't reviewed.
 */
interface UBS_SEO_Targeted_Fix extends UBS_SEO_Fix {
    /** @param array<string,string> $values page ref => approved value */
    public function use_approved_values( array $values ): void;

    /** @param array<string,string> $sources page ref => 'ai' | 'edited' */
    public function use_value_sources( array $sources ): void;

    /** @return string[] refs the last apply() actually wrote */
    public function applied_refs(): array;

    /**
     * Undo offer for a page this fix wrote — {id, to} of the history record a
     * revert would restore, or null when there is nothing safely revertible.
     *
     * @return array{id:int, to:string}|null
     */
    public function revert_offer( string $ref ): ?array;
}

/**
 * Shared mechanics for targeted fixes: resolve which pages an apply touches —
 * always the user-approved subset of the affected list.
 */
trait UBS_SEO_Targeted_Apply_Helpers {

    /** Values the user approved in the preview, keyed by page ref. */
    private array $approved_values = [];

    /** 'ai' | 'edited' per ref — whether the user changed the suggestion. */
    private array $value_sources = [];

    /** Refs apply() actually wrote on its last run. */
    private array $applied_refs = [];

    public function use_approved_values( array $values ): void {
        $this->approved_values = $values;
    }

    /** @param array<string,string> $sources page ref => 'ai' | 'edited' */
    public function use_value_sources( array $sources ): void {
        $this->value_sources = $sources;
    }

    /** History `source` for a ref; anything but an explicit 'edited' counts as AI. */
    protected function value_source( string $ref ): string {
        return ( $this->value_sources[ $ref ] ?? '' ) === 'edited' ? 'edited' : 'ai';
    }

    /** @return array<string,string> */
    protected function approved_values(): array {
        return $this->approved_values;
    }

    /**
     * Pages the last apply() actually CHANGED. The REST layer confirms an apply
     * from this, never from apply() merely not erroring — a page can drop out
     * of the target scan between preview and apply (fixed elsewhere, deleted),
     * and reporting it as fixed would be a lie.
     *
     * @return string[]
     */
    public function applied_refs(): array {
        return $this->applied_refs;
    }

    /**
     * Record one written page; call once per page apply() changes. Refs are
     * usually post ids, but can be a non-numeric sentinel (e.g. 'home' for a
     * blog-index homepage, whose meta is site-level and has no post).
     *
     * @param int|string $ref
     */
    protected function record_applied_ref( $ref ): void {
        $this->applied_refs[] = (string) $ref;
    }

    /** Reset the written-refs record; call at the top of apply(). */
    protected function reset_applied_refs(): void {
        $this->applied_refs = [];
    }

    /**
     * Pages this apply should touch: the approved refs that are still on the
     * affected list — never a page outside it, and never a page the user
     * didn't approve (an apply with no approved values writes nothing).
     *
     * @param int[] $affected pages that currently have the issue
     * @return int[]
     */
    protected function resolve_targets( array $affected ): array {
        $approved = array_map( 'intval', array_keys( $this->approved_values ) );
        return array_values( array_intersect( $approved, $affected ) );
    }

}

