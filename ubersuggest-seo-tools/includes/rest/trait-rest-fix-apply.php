<?php
defined( 'ABSPATH' ) || exit;

/**
 * The write endpoints: applying approved fixes, undoing one from its history
 * record, and recording that the review prompt was shown.
 */
trait UBS_SEO_Rest_Fix_Apply {

    /**
     * Undo one applied fix from its history record. Refusals come back with
     * `ok: false` plus the engine's reason code — the UI disables the Revert
     * with an explanation instead of failing silently (see UBS_SEO_Fix_Revert).
     */
    public function history_revert( WP_REST_Request $request ): WP_REST_Response {
        $result = UBS_SEO_Fix_Revert::revert( (int) $request->get_param( 'id' ) );
        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'ok'    => false,
                'code'  => $result->get_error_code(),
                'error' => $result->get_error_message(),
            ] );
        }
        return new WP_REST_Response( $result );
    }

    /** Apply a fix to the live site. */
    public function fix_apply( WP_REST_Request $request ): WP_REST_Response {
        $fix = UBS_SEO_Fixes::for_issue( sanitize_text_field( (string) $request->get_param( 'issue' ) ) );
        if ( ! $fix ) {
            return $this->fix_result( new WP_Error( 'ubs_seo_unknown_fix', __( 'No fix is available for this issue.', 'ubersuggest-seo-tools' ) ) );
        }

        // Write the exact values the user approved in the preview — and ONLY the
        // pages they approved (per-card Apply) — so apply matches what was shown
        // and skips a second (chargeable) AI call.
        $fix->use_approved_values( $this->approved_values( $request->get_param( 'values' ) ) );
        $fix->use_value_sources( $this->value_sources( $request->get_param( 'sources' ) ) );

        $result = $fix->apply();
        if ( is_wp_error( $result ) ) {
            return $this->fix_result( $result );
        }

        // The fix reports which pages it actually WROTE. A page can drop out
        // of the target scan between preview and apply (fixed elsewhere,
        // deleted) — confirming an apply that wrote nothing would falsely mark
        // cards fixed and credit the issue in the Fixed tab.
        $applied_refs = $fix->applied_refs();
        if ( $applied_refs === [] ) {
            // Say WHY each requested ref was skipped (visible in the Network
            // tab) — 'not_broken' = the live re-check considered the page
            // already fixed; 'not_in_targets' = the ref left the crawl list.
            $skipped   = $fix->skipped_refs();
            $requested = array_keys( $this->approved_values( $request->get_param( 'values' ) ) );
            foreach ( $requested as $requested_ref ) {
                if ( ! isset( $skipped[ $requested_ref ] ) ) {
                    $skipped[ $requested_ref ] = 'not_in_targets';
                }
            }
            return new WP_REST_Response( [ 'ok' => false, 'code' => 'nothing_applied', 'debug' => $skipped ], 200 );
        }
        UBS_SEO_Fixes::record_applied( $fix->issue_id() );
        // Undo offers for the pages just written, so the green cards can offer
        // Undo right away — the history rows were created by this very apply.
        $revert_offers = [];
        foreach ( $applied_refs as $applied_ref ) {
            $offer = $fix->revert_offer( $applied_ref );
            if ( $offer !== null ) {
                $revert_offers[ $applied_ref ] = $offer;
            }
        }
        return new WP_REST_Response( [
            'ok'                 => true,
            'appliedRefs'        => $applied_refs,
            'revertOffers'       => $revert_offers,
            'shouldAskForReview' => UBS_SEO_Review_Prompt::should_ask(),
        ] );
    }

    /**
     * Records that the review prompt was shown to the current user.
     *
     * The UI calls this when the modal actually opens, not when apply answers
     * `askReview` — a user who leaves wp-admin during the delay is asked again
     * after their next fix instead of losing the ask to a modal nobody saw.
     */
    public function review_prompt_shown(): WP_REST_Response {
        UBS_SEO_Review_Prompt::mark_asked();
        return new WP_REST_Response( [ 'ok' => true ] );
    }

}
