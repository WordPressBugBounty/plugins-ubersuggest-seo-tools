<?php
defined( 'ABSPATH' ) || exit;

/**
 * Writing a fix's audit trail: one history record per page written, grouped
 * into an apply session, plus the Undo offer derived from it. Recording is
 * mandatory before a write — the record is the only copy of the previous
 * value, so an unrecorded overwrite is unrecoverable.
 */
trait UBS_SEO_Fix_History_Recording {

    /** Session id shared by every history record of one apply() run. */
    private string $history_session_id = '';

    /** Backend's cached suggestions, keyed by normalized url; null until read. */
    private ?array $cached_suggestions = null;

    /** Call at the top of apply(); groups its writes for bulk revert later. */
    protected function begin_history_session(): void {
        $this->history_session_id = UBS_SEO_Fix_History::new_session_id();
        $this->cached_suggestions = null;
    }

    /**
     * The backend's suggestions for this issue, keyed by normalized url — the
     * history's ai-vs-edited column is derived from them server-side rather than
     * trusted from the client (it's an audit log).
     *
     * Read at most once per apply, and only when a write actually needs a
     * `source` decided: an apply that writes nothing (every page skipped) used
     * to pay for the round-trip anyway. It also must NOT create a project —
     * a detail of the audit log has no business POSTing to the backend on a
     * write path — so the read-only project lookup is used.
     */
    private function suggestion_map(): array {
        if ( $this->cached_suggestions === null ) {
            $this->cached_suggestions = UBS_SEO_Suggestions::cached_map( $this->issue_id(), false );
        }
        return $this->cached_suggestions;
    }

    /**
     * 'ai' when the value matches the backend's cached suggestion for the page,
     * 'edited' when it provably differs; the client's claim only breaks the tie
     * when the cache is unreadable.
     */
    protected function derive_source( string $url, string $value, string $ref ): string {
        $suggestion = $this->suggestion_map()[ UBS_SEO_Audit_Service::normalize_url( $url ) ] ?? null;
        if ( is_string( $suggestion ) && $suggestion !== '' ) {
            // Compare like with like: every approved value reaches us through
            // sanitize_text_field (whitespace collapsed, newlines dropped), so
            // comparing against the RAW suggestion recorded 'edited' for text
            // the user never touched — inverting the one distinction this
            // column exists to make.
            return sanitize_text_field( $suggestion ) === $value ? 'ai' : 'edited';
        }
        return $this->value_source( $ref );
    }

    /** Log one post write to the fix history; call immediately before store(). */
    protected function record_post_write( WP_Post $post, string $applied_value ): int {
        $page_url = (string) get_permalink( $post );
        return UBS_SEO_Fix_History::record_write( [
            'session_id'       => $this->history_session_id,
            'issue_id'         => $this->issue_id(),
            'ref'              => (string) $post->ID,
            'field'            => $this->field(),
            'page_title'       => get_the_title( $post ),
            'page_url'         => $page_url,
            'previous_raw'     => $this->raw_value( $post ),
            'previous_display' => $this->before_value( $post ),
            'applied_value'    => $applied_value,
            'source'           => $this->derive_source( $page_url, $applied_value, (string) $post->ID ),
            'integration'      => $this->integration_name(),
        ] );
    }

    /**
     * Offer data for the Undo button on a fixed card: the history record id to
     * revert plus the value that would come back. Only offered while the field
     * still holds exactly what we applied — once the user (or another tool)
     * moved it, the revert engine would refuse anyway, so no dead button.
     *
     * Public because fix_apply's response carries the offers for the refs it
     * just wrote — the drawer's green card must offer Undo immediately, not
     * only after a reopen re-lists the page.
     *
     * @return array{id:int, to:string}|null
     */
    public function revert_offer( string $ref ): ?array {
        $field  = $ref === self::HOME_REF ? 'home_' . $this->field() : $this->field();
        $record = UBS_SEO_Fix_History::last_write( $ref, $field );
        if ( $record === null || $record['action'] !== UBS_SEO_Fix_History::ACTION_APPLY ) {
            return null;
        }
        // The three title issues share the 'title' field: a card may only offer
        // its OWN issue's record, or one drawer would undo another's fix.
        if ( (string) $record['issue_id'] !== $this->issue_id() ) {
            return null;
        }
        if ( ! $this->holds_applied_value( $ref, (string) $record['applied_value'] ) ) {
            return null;
        }
        // 'to' is what the revert actually WRITES (previous_raw) — '' when it
        // clears the field; the app localizes that case's wording itself.
        return [
            'id' => (int) $record['id'],
            'to' => (string) $record['previous_raw'],
        ];
    }

    /** Whether the live field still equals what the recorded apply wrote. */
    protected function holds_applied_value( string $ref, string $applied_value ): bool {
        if ( $ref === self::HOME_REF ) {
            return $this->home_raw_value() === $applied_value;
        }
        $post = get_post( (int) $ref );
        return $post instanceof WP_Post && $this->raw_value( $post ) === $applied_value;
    }

    /** Log the homepage write (site-level meta, no post behind it). */
    private function record_home_write( string $home_url, string $applied_value ): int {
        return UBS_SEO_Fix_History::record_write( [
            'session_id'       => $this->history_session_id,
            'issue_id'         => $this->issue_id(),
            'ref'              => self::HOME_REF,
            'field'            => 'home_' . $this->field(),
            'page_title'       => get_bloginfo( 'name' ),
            'page_url'         => $home_url,
            'previous_raw'     => $this->home_raw_value(),
            'previous_display' => $this->home_before_value(),
            'applied_value'    => $applied_value,
            'source'           => $this->derive_source( $home_url, $applied_value, self::HOME_REF ),
            'integration'      => $this->integration_name(),
        ] );
    }

}
