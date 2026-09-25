<?php
defined( 'ABSPATH' ) || exit;

/**
 * Restores what a fix history record overwrote, through the same integration
 * path that applied it. One safety rule governs everything here: never destroy
 * a value this plugin did not write — if the field moved on since our write
 * (manual edit, another tool, a different SEO plugin took over), the revert
 * refuses with an explicit reason instead of failing silently or clobbering.
 *
 * A successful revert is itself logged as a history record (`action: revert`,
 * `reverts: <original id>`, source 'history'), so reverting a revert needs no
 * special case — it is just another record whose previous value is on file.
 */
class UBS_SEO_Fix_Revert {

    /**
     * Undo one history record.
     *
     * @param int    $record_id  the history record to revert
     * @param string $session_id shared by a bulk revert; '' = one fresh session
     * @return array{ok:true, revertRecordId:int}|WP_Error error codes:
     *   record_not_found | superseded | post_deleted | integration_changed
     *   | value_changed | content_edited | unsupported_record | revert_failed
     */
    public static function revert( int $record_id, string $session_id = '' ) {
        $record = UBS_SEO_Fix_History::find_by_id( $record_id );
        if ( $record === null ) {
            return new WP_Error( 'record_not_found', __( 'This history record no longer exists.', 'ubersuggest-seo-tools' ) );
        }
        $refusal = self::can_revert( $record );
        if ( $refusal instanceof WP_Error ) {
            return $refusal;
        }
        $session_id = $session_id !== '' ? $session_id : UBS_SEO_Fix_History::new_session_id();

        switch ( self::path_for( $record ) ) {
            case 'content_h1':
                $result = self::revert_content_heading( $record, $session_id );
                break;
            case 'home_meta':
                $result = self::revert_home_meta( $record, $session_id );
                break;
            case 'post_meta':
                $result = self::revert_post_meta( $record, $session_id );
                break;
            default:
                // Unreachable (can_revert refuses a path-less record), spelled
                // out so a new field cannot fall into the post-meta write.
                $result = new WP_Error( 'unsupported_record', __( 'This history record cannot be reverted.', 'ubersuggest-seo-tools' ) );
        }

        // Keep the issue-level applied ledger honest: undoing an apply un-marks
        // the issue (or the Fixed tab shows it resolved forever once the crawl
        // stops flagging it); undoing a revert puts the fix — and the mark — back.
        if ( ! is_wp_error( $result ) ) {
            $issue_id = (string) $record['issue_id'];
            if ( (string) $record['action'] === UBS_SEO_Fix_History::ACTION_APPLY ) {
                // The ledger is per ISSUE, so it may only be dropped once no
                // page still holds our write — undoing one of five fixed pages
                // used to take the whole issue out of the Fixed tab.
                if ( ! self::applied_elsewhere( $issue_id, (string) $record['ref'] ) ) {
                    UBS_SEO_Fixes::forget_applied( $issue_id );
                }
            } else {
                UBS_SEO_Fixes::record_applied( $issue_id );
            }
        }
        return $result;
    }

    /**
     * Why $record cannot be reverted right now, or null when it can.
     *
     * Read-only, and the one place that decides whether a RECORD may be
     * reverted: the History tab asks per row to enable Undo, revert() asks
     * before writing, so a live button cannot refuse on click. The destructive
     * H1 branch guards itself on top of this.
     *
     * Not revert_offer(), which answers a narrower question for the issues
     * drawer and has rules of its own (apply-only, matching issue_id).
     *
     * @param array<string,mixed>|null $newest when the caller already read it;
     * an optimization, and only correct when it really is that row. revert()
     * omits it — a write path re-reads.
     * @return WP_Error|null
     */
    public static function can_revert( array $record, ?array $newest = null ): ?WP_Error {
        // Only the newest write of a (ref, field) still describes the live
        // value. An older record's applied_value is long overwritten, so
        // restoring its previous_raw would silently undo the newer fix too.
        $newest ??= UBS_SEO_Fix_History::last_write( (string) $record['ref'], (string) $record['field'] );
        if ( $newest === null || (int) $newest['id'] !== (int) $record['id'] ) {
            return new WP_Error( 'superseded', __( 'A later change to this field replaced this one.', 'ubersuggest-seo-tools' ) );
        }
        switch ( self::path_for( $record ) ) {
            case 'content_h1':
                return self::check_content_heading( $record );
            case 'home_meta':
                return self::check_home_meta( $record );
            case 'post_meta':
                return self::check_post_meta( $record );
            default:
                return new WP_Error( 'unsupported_record', __( 'This history record cannot be reverted.', 'ubersuggest-seo-tools' ) );
        }
    }

    /**
     * Which revert path a record takes, or '' when none does. Fields are
     * whitelisted so an unexpected one refuses instead of falling into "not
     * title, must be description"; checks and writes dispatch through here, so
     * a field cannot be checked down one path and written down another.
     *
     * @return 'post_meta'|'home_meta'|'content_h1'|''
     */
    private static function path_for( array $record ): string {
        $field = (string) $record['field'];
        if ( 'content' === (string) $record['integration'] ) {
            return 'h1' === $field ? 'content_h1' : '';
        }
        if ( in_array( $field, [ 'home_title', 'home_description' ], true ) ) {
            return 'home_meta';
        }
        if ( in_array( $field, [ 'title', 'description' ], true ) ) {
            return 'post_meta';
        }
        return '';
    }

    /** The store the record was written through, or the reason it is gone. */
    private static function active_store_for( array $record ) {
        $store = UBS_SEO_Meta_Stores::active();
        if ( $store->name() !== (string) $record['integration'] ) {
            /* translators: %s: SEO plugin that wrote the fix, e.g. "Yoast SEO". */
            return new WP_Error( 'integration_changed', sprintf( __( 'This fix was written through %s, which is no longer managing this site\'s SEO meta.', 'ubersuggest-seo-tools' ), (string) $record['integration'] ) );
        }
        return $store;
    }

    /**
     * The post a record points at, or the reason it cannot be read.
     *
     * Refuses id 0 rather than reading it: (int) 'home' is 0, and get_post(0)
     * resolves to the global $post — a check would validate against THAT post
     * while the write went to id 0. Every path here uses the $post this
     * returns, so guard and write never look at different rows.
     *
     * @return WP_Post|WP_Error
     */
    private static function post_of( array $record ) {
        $post_id = (int) $record['ref'];
        if ( $post_id <= 0 ) {
            return new WP_Error( 'unsupported_record', __( 'This history record cannot be reverted.', 'ubersuggest-seo-tools' ) );
        }
        $post = get_post( $post_id );
        return $post instanceof WP_Post
            ? $post
            : new WP_Error( 'post_deleted', __( 'The page this fix was applied to no longer exists.', 'ubersuggest-seo-tools' ) );
    }

    /** The live value of the post field this record wrote. */
    private static function live_post_value( UBS_SEO_Meta_Store $store, int $post_id, array $record ): string {
        return (string) $record['field'] === 'title' ? $store->get_title( $post_id ) : $store->get_description( $post_id );
    }

    /** The live value of the site-level field this record wrote. */
    private static function live_home_value( UBS_SEO_Meta_Store $store, array $record ): string {
        return (string) $record['field'] === 'home_title' ? $store->get_home_title() : $store->get_home_description();
    }

    /** Guard for the post title/description path. */
    private static function check_post_meta( array $record ): ?WP_Error {
        $store = self::active_store_for( $record );
        if ( $store instanceof WP_Error ) {
            return $store;
        }
        $post = self::post_of( $record );
        if ( $post instanceof WP_Error ) {
            return $post;
        }
        if ( self::live_post_value( $store, $post->ID, $record ) !== (string) $record['applied_value'] ) {
            return new WP_Error( 'value_changed', __( 'The field was changed after this fix — reverting would overwrite that edit.', 'ubersuggest-seo-tools' ) );
        }
        return null;
    }

    /** Guard for the homepage title/description path. */
    private static function check_home_meta( array $record ): ?WP_Error {
        $store = self::active_store_for( $record );
        if ( $store instanceof WP_Error ) {
            return $store;
        }
        if ( self::live_home_value( $store, $record ) !== (string) $record['applied_value'] ) {
            return new WP_Error( 'value_changed', __( 'The field was changed after this fix — reverting would overwrite that edit.', 'ubersuggest-seo-tools' ) );
        }
        return null;
    }

    /**
     * Guard for the H1 content path, both directions: an apply record needs its
     * block still verbatim to remove it, a revert record needs the heading it
     * would restore to be absent.
     */
    private static function check_content_heading( array $record ): ?WP_Error {
        $post = self::post_of( $record );
        if ( $post instanceof WP_Error ) {
            return $post;
        }
        $heading_text = (string) $record['applied_value'];
        if ( $heading_text !== '' ) {
            return str_contains( (string) $post->post_content, UBS_SEO_H1_Fix::heading_block( $heading_text ) )
                ? null
                : new WP_Error( 'content_edited', __( 'The page content was edited after this fix — the heading can no longer be removed automatically.', 'ubersuggest-seo-tools' ) );
        }
        return str_contains( (string) $post->post_content, UBS_SEO_H1_Fix::heading_block( (string) $record['previous_raw'] ) )
            ? new WP_Error( 'value_changed', __( 'The field was changed after this fix — reverting would overwrite that edit.', 'ubersuggest-seo-tools' ) )
            : null;
    }

    /**
     * Title/description through a meta store. {@see self::can_revert()} settled
     * every refusal; what remains is the write and the read-back proving it.
     */
    private static function revert_post_meta( array $record, string $session_id ) {
        $store = UBS_SEO_Meta_Stores::active();
        $post  = self::post_of( $record );
        if ( $post instanceof WP_Error ) {
            return $post;
        }
        $post_id  = $post->ID;
        $is_title = (string) $record['field'] === 'title';
        $current  = self::live_post_value( $store, $post_id, $record );
        $restored = (string) $record['previous_raw'];
        if ( $is_title ) {
            $store->set_title( $post_id, $restored );
        } else {
            $store->set_description( $post_id, $restored );
        }
        // Logged only after the write proves itself (read back): a failed write
        // must not leave a phantom revert record that kills the Undo forever.
        if ( self::live_post_value( $store, $post_id, $record ) !== $restored ) {
            return new WP_Error( 'revert_failed', __( 'Restoring the previous value failed.', 'ubersuggest-seo-tools' ) );
        }
        return self::logged_revert( $record, $session_id, $current, $restored );
    }

    /** Homepage title/description: site-level settings, no post behind them. */
    private static function revert_home_meta( array $record, string $session_id ) {
        $store    = UBS_SEO_Meta_Stores::active();
        $current  = self::live_home_value( $store, $record );
        $restored = (string) $record['previous_raw'];
        if ( (string) $record['field'] === 'home_title' ) {
            $store->set_home_title( $restored );
        } else {
            $store->set_home_description( $restored );
        }
        if ( self::live_home_value( $store, $record ) !== $restored ) {
            return new WP_Error( 'revert_failed', __( 'Restoring the previous value failed.', 'ubersuggest-seo-tools' ) );
        }
        return self::logged_revert( $record, $session_id, $current, $restored );
    }

    /**
     * The H1 fix prepends a heading block to post content, so its revert edits
     * content too — remove the exact recorded block, byte for byte, or refuse.
     * Restoring the whole previous post_content instead would destroy every
     * edit made after the fix, which is precisely what a revert must never do.
     *
     * An apply record (applied_value = heading text) reverts by removing the
     * block; a revert record (applied_value = '') reverts by prepending it
     * again — so revert-of-revert also holds for content. Both directions were
     * already cleared by {@see self::can_revert()}.
     */
    private static function revert_content_heading( array $record, string $session_id ) {
        $post = self::post_of( $record );
        if ( $post instanceof WP_Error ) {
            return $post;
        }
        $content      = (string) $post->post_content;
        $heading_text = (string) $record['applied_value'];

        if ( $heading_text !== '' ) {
            $block    = UBS_SEO_H1_Fix::heading_block( $heading_text );
            $position = strpos( $content, $block );
            // Guard, not dead code, though can_revert() already refused this:
            // strpos returns false, which substr_replace coerces to offset 0
            // and then deletes bytes from the START of the post body.
            if ( $position === false ) {
                return new WP_Error( 'content_edited', __( 'The page content was edited after this fix — the heading can no longer be removed automatically.', 'ubersuggest-seo-tools' ) );
            }
            // wp_slash: wp_update_post unslashes, which would strip backslashes
            // from the rest of the post body. Logged only after a proven write.
            $updated = wp_update_post( [ 'ID' => $post->ID, 'post_content' => wp_slash( substr_replace( $content, '', $position, strlen( $block ) ) ) ], true );
            if ( is_wp_error( $updated ) || $updated === 0 ) {
                return new WP_Error( 'revert_failed', __( 'Restoring the previous value failed.', 'ubersuggest-seo-tools' ) );
            }
            return self::logged_revert( $record, $session_id, $heading_text, '' );
        }

        // Undoing a removal: put the recorded heading back. No second guard —
        // can_revert() refuses a hand-re-added heading, and the worst case is a
        // duplicate: visible and fixable, unlike the truncation above.
        $restored_text = (string) $record['previous_raw'];
        $block         = UBS_SEO_H1_Fix::heading_block( $restored_text );
        $updated       = wp_update_post( [ 'ID' => $post->ID, 'post_content' => wp_slash( $block . $content ) ], true );
        if ( is_wp_error( $updated ) || $updated === 0 ) {
            return new WP_Error( 'revert_failed', __( 'Restoring the previous value failed.', 'ubersuggest-seo-tools' ) );
        }
        return self::logged_revert( $record, $session_id, '', $restored_text );
    }

    /**
     * Whether any OTHER page still carries a fix this plugin applied for
     * $issue_id. revert_offer() is the existing "our value is still there"
     * test: it returns null once the field moved on or was itself reverted.
     */
    private static function applied_elsewhere( string $issue_id, string $reverted_ref ): bool {
        $fix = UBS_SEO_Fixes::for_issue( $issue_id );
        if ( $fix === null ) {
            return false;
        }
        foreach ( UBS_SEO_Fix_History::applied_refs( $issue_id ) as $ref ) {
            if ( $ref === $reverted_ref ) {
                continue;
            }
            if ( $fix->revert_offer( $ref ) !== null ) {
                return true;
            }
        }
        return false;
    }

    /**
     * The success payload of a revert. `unlogged` marks the rare case where the
     * restore went through but its history row did not: the value IS back, so
     * answering with an error would be the bigger lie, but that step is missing
     * from the audit trail and nothing can be redone from it.
     *
     * @return array{ok:bool, revertRecordId:int, unlogged?:bool}
     */
    private static function logged_revert( array $record, string $session_id, string $current_value, string $restored_value ): array {
        $revert_record_id = self::log_revert( $record, $session_id, $current_value, $restored_value );
        $result           = [ 'ok' => true, 'revertRecordId' => $revert_record_id ];
        if ( $revert_record_id === 0 ) {
            $result['unlogged'] = true;
        }
        return $result;
    }

    /**
     * The revert's own history record — logged AFTER the write proves itself, so
     * a refused write cannot leave a phantom revert behind (see the call sites).
     * Page snapshot is copied from the original record: the page identity did
     * not change, and for `home` there is no post to re-read it from.
     */
    private static function log_revert( array $record, string $session_id, string $current_value, string $restored_value ): int {
        return UBS_SEO_Fix_History::record_write( [
            'session_id'       => $session_id,
            'action'           => UBS_SEO_Fix_History::ACTION_REVERT,
            'reverts'          => (int) $record['id'],
            'issue_id'         => (string) $record['issue_id'],
            'ref'              => (string) $record['ref'],
            'field'            => (string) $record['field'],
            'page_title'       => (string) $record['page_title'],
            'page_url'         => (string) $record['page_url'],
            'previous_raw'     => $current_value,
            'previous_display' => $current_value,
            'applied_value'    => $restored_value,
            // Not 'ai' nor 'edited': the value came from the history itself.
            'source'           => 'history',
            'integration'      => (string) $record['integration'],
        ] );
    }
}
