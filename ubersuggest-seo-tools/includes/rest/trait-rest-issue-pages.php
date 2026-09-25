<?php
defined( 'ABSPATH' ) || exit;

/**
 * Affected pages for a MANUAL issue: same card shape as a fixable one, but
 * copy-only — there is nothing to apply.
 */
trait UBS_SEO_Rest_Issue_Pages {

    /**
     * Pages the audit flagged for a MANUAL issue (no local fix), in the same
     * card row shape — and generate / poll protocol — as fix_preview, so the
     * drawer renders the same layout. When the backend can generate an AI
     * suggestion for the issue (e.g. duplicate titles), rows support
     * start / regenerate / poll per ref (the ref is the crawl URL); the user
     * copies or edits the suggestion, but there is nothing to apply locally.
     */
    public function issue_pages( WP_REST_Request $request ): WP_REST_Response {
        $issue      = sanitize_text_field( (string) $request->get_param( 'issue' ) );
        $ai_capable = UBS_SEO_Suggestions::is_ai_capable( $issue );

        // Generate / poll one page, mirroring fix_preview's modes.
        $ref = $this->sanitize_ref( (string) $request->get_param( 'ref' ) );
        if ( $ai_capable && $ref !== '' ) {
            if ( $request->get_param( 'regenerate' ) ) {
                $mode = 'regenerate';
            } elseif ( $request->get_param( 'start' ) ) {
                $mode = 'generate';
            } else {
                $mode = 'status';
            }
            if ( $request->get_param( 'refresh_plan' ) ) {
                delete_transient( self::FREE_PLAN_TRANSIENT );
            }
            // Same server-side free-plan backstop as fix_preview.
            if ( 'status' !== $mode && true === $this->is_free_plan() ) {
                return new WP_REST_Response( [ 'rows' => [], 'pending' => false, 'freePlan' => true ] );
            }
            $result = UBS_SEO_Suggestions::for_url_async( $issue, $ref, $mode );
            $auth_error = UBS_SEO_Api_Client::last_auth_error();
            if ( $auth_error instanceof WP_Error ) {
                return $this->error_response( $auth_error );
            }
            $row    = $this->manual_page_row( $issue, $ref, $ai_capable );
            $row['after']  = $result['suggestion'] ?? null;
            $row['status'] = $result['status'];
            $row['source'] = ( $result['status'] === 'ready' ) ? 'ai' : null;
            $row['debug']  = $result['debug'] ?? null;
            $response = [
                'rows'    => [ $row ],
                'pending' => $result['status'] === 'pending',
            ] + $this->project_error_fields();
            return new WP_REST_Response( $response );
        }

        // List step: one card row per flagged URL, restoring any suggestion
        // already generated (server-side cache) — never charges.
        $items = UBS_SEO_Audit_Service::breakdown_items( $issue );
        if ( $items === null ) {
            // Couldn't reach the backend — surface it instead of an empty list
            // that reads as "no affected pages".
            return new WP_REST_Response( [ 'error' => __( 'Could not load the affected pages — try again.', 'ubersuggest-seo-tools' ), 'rows' => [], 'pending' => false ], 200 );
        }
        $cached = $ai_capable ? UBS_SEO_Suggestions::cached_map( $issue ) : [];
        $rows   = [];
        foreach ( $items as $item ) {
            $url        = $item['url'];
            $row        = $this->manual_page_row( $issue, $url, $ai_capable, $item['attachments'] );
            $cached_key = UBS_SEO_Audit_Service::normalize_url( $url );
            if ( isset( $cached[ $cached_key ] ) && $cached[ $cached_key ] !== '' ) {
                $row['after']  = $cached[ $cached_key ];
                $row['status'] = 'ready';
                $row['source'] = 'ai';
            }
            $rows[] = $row;
        }
        $response = [ 'rows' => $rows, 'pending' => false ];
        if ( $ai_capable ) {
            $free = $this->is_free_plan();
            if ( null !== $free ) {
                $response['freePlan'] = $free;
            }
        }
        if ( $ai_capable && $items !== [] ) {
            $credits = UBS_SEO_Suggestions::credits_for_url( $issue, $items[0]['url'] );
            if ( $credits !== null ) {
                $response['credits'] = $credits;
            }
        }
        return new WP_REST_Response( $response );
    }

    /**
     * One card row for a crawl URL: label and current value come from the
     * matching post when the URL resolves to one; 'info' rows (non-AI issues)
     * render with no generate affordance.
     */
    private function manual_page_row( string $issue, string $url, bool $ai_capable, array $attachments = [] ): array {
        $post_id = url_to_postid( $url );
        $label   = $post_id > 0 ? get_the_title( $post_id ) : (string) wp_parse_url( $url, PHP_URL_PATH );
        if ( $label === '' || $label === null ) {
            $label = $url;
        }
        // The relevant "current value" for the backend-supported manual issues:
        // the page's title (duplicate titles) or meta description (duplicates).
        $before = '';
        if ( $post_id > 0 && str_contains( $issue, 'title' ) ) {
            $seo_title = UBS_SEO_Meta_Stores::active()->get_title( $post_id );
            $before    = $seo_title !== '' ? $seo_title : (string) get_the_title( $post_id );
        } elseif ( $post_id > 0 && str_contains( $issue, 'description' ) ) {
            $before = UBS_SEO_Meta_Stores::active()->get_description( $post_id );
        }
        $row = [
            'ref'    => $url,
            'label'  => $label,
            'url'    => $url,
            'before' => $before,
            'after'  => null,
            'status' => $ai_capable ? 'idle' : 'info',
            'source' => null,
        ];
        // For a blocked page the crawl's own reason IS the actionable detail —
        // robots.txt and a Robots meta tag need different remedies. Sent raw
        // (the dashboard's own vocabulary) because PHP has no translations; the
        // React side maps it to a `page_blocked_by_*` string.
        if ( $issue === 'page_allowed' ) {
            $reason = trim( (string) ( $attachments['page_blocked_reason'] ?? '' ) );
            if ( $reason !== '' ) {
                $row['blockedReason'] = sanitize_key( $reason );
            }
        }
        return $row;
    }

}
