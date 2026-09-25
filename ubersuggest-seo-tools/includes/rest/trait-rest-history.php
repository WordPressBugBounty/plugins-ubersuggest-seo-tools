<?php
defined( 'ABSPATH' ) || exit;

/**
 * The Fix History tab's read endpoint: one page of the local audit log, with
 * the filters the screen offers and, per row, whether Undo can still run.
 *
 * Reverting is not here — that is `POST /history/revert` in
 * {@see UBS_SEO_Rest_Fix_Apply}, which the tab reuses unchanged.
 */
trait UBS_SEO_Rest_History {

    /**
     * Rows per page. A method, not a constant: constants in traits are PHP
     * 8.2+ and this plugin supports 8.0, where declaring one is a fatal.
     */
    private static function history_per_page(): int {
        return 25;
    }

    /**
     * One page of fix history, newest first.
     *
     * Query: `issue`, `ref`, `search` (page title or URL), `page`.
     */
    public function history_list( WP_REST_Request $request ): WP_REST_Response {
        $args = [
            'issue_id' => sanitize_text_field( (string) $request->get_param( 'issue' ) ),
            // A ref is a post id or the 'home' sentinel; sanitize_text_field
            // would mangle both.
            'ref'      => $this->sanitize_ref( (string) $request->get_param( 'ref' ) ),
            'search'   => sanitize_text_field( (string) $request->get_param( 'search' ) ),
            'page'     => max( 1, (int) $request->get_param( 'page' ) ),
            'per_page' => self::history_per_page(),
        ];
        $records = UBS_SEO_Fix_History::list_records( $args );
        // Fetched together: history_written_display() needs one per revert row.
        $undone  = UBS_SEO_Fix_History::find_many( array_column( $records, 'reverts' ) );
        return new WP_REST_Response( [
            'records'    => array_map(
                fn( array $record ): array => $this->history_record( $record, $undone ),
                $records
            ),
            'total'      => UBS_SEO_Fix_History::count_records( $args ),
            'perPage'    => self::history_per_page(),
            'issueTypes' => UBS_SEO_Fix_History::issue_types(),
        ] );
    }

    /**
     * One stored row as the screen needs it. `before` is the EFFECTIVE value
     * before the write, so a title diff shows the rendered fallback rather
     * than the empty override a revert actually restores.
     *
     * @param array<int,array<string,mixed>> $undone keyed by id
     */
    private function history_record( array $record, array $undone = [] ): array {
        // One read, two questions: `stale` and the refusal both turn on it.
        $newest  = UBS_SEO_Fix_History::last_write( (string) $record['ref'], (string) $record['field'] );
        $refusal = UBS_SEO_Fix_Revert::can_revert( $record, $newest );
        return [
            'id'            => (int) $record['id'],
            'action'        => (string) $record['action'],
            'issueId'       => (string) $record['issue_id'],
            'ref'           => (string) $record['ref'],
            'field'         => (string) $record['field'],
            'pageTitle'     => (string) $record['page_title'],
            'pageUrl'       => (string) $record['page_url'],
            // False = the page is gone, so the row must not link to it.
            'pageExists'    => $this->history_page_exists( (string) $record['ref'] ),
            'before'        => (string) $record['previous_display'],
            // Does the undo write a value back, or clear the field? Both undo
            // surfaces branch on this same column, `before` only displays.
            'restores'      => (string) $record['previous_raw'] !== '',
            'after'         => $this->history_written_display( $record, $undone ),
            'stale'         => UBS_SEO_Fix_History::is_stale_write( $record, $newest ),
            'source'        => (string) $record['source'],
            'integration'   => (string) $record['integration'],
            'user'          => $this->history_user_name( (int) $record['user_id'] ),
            'appliedAt'     => gmdate( 'c', (int) strtotime( (string) $record['created_at'] . ' UTC' ) ),
            // The same instant as a site-timezone wall clock, as digits: PHP
            // would word it in the SITE locale, the app runs in the user's.
            'appliedAtSite' => get_date_from_gmt( (string) $record['created_at'], 'Y-m-d H:i:s' ),
            // null = Undo is live; otherwise the engine's own refusal code, so
            // the button disables for the reason a click would have failed.
            'revertRefusal' => $refusal instanceof WP_Error ? $refusal->get_error_code() : null,
        ];
    }

    /**
     * The value the diff shows this write as having left on the page.
     *
     * An apply left `applied_value`. A revert did not: it writes back
     * `previous_raw`, which is '' whenever the fix added an override the page
     * never had — so the diff read "Old title → (empty)" and looked like an
     * erase. The undone record's `previous_display` is what actually came
     * back. Never fall back to `applied_value` here; that is the '' again.
     */
    private function history_written_display( array $record, array $undone = [] ): string {
        if ( (string) $record['action'] !== UBS_SEO_Fix_History::ACTION_REVERT || empty( $record['reverts'] ) ) {
            return (string) $record['applied_value'];
        }
        return (string) (
            $undone[ (int) $record['reverts'] ]['previous_display'] ?? $record['previous_display']
        );
    }

    /** The homepage has no post behind it; the site itself is the page. */
    private function history_page_exists( string $ref ): bool {
        // > 0, not ctype_digit: get_post(0) resolves to the global $post, and
        // ctype_digit('0') is true. Same guard as post_of().
        return UBS_SEO_Fix_History::HOME_REF === $ref
            || ( (int) $ref > 0 && get_post( (int) $ref ) instanceof WP_Post );
    }

    /** Who applied it. '' when the user was deleted — the record outlives them. */
    private function history_user_name( int $user_id ): string {
        $user = $user_id > 0 ? get_userdata( $user_id ) : false;
        return $user ? (string) $user->display_name : '';
    }

}
