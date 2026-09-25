<?php
defined( 'ABSPATH' ) || exit;

/**
 * The fix preview endpoint — the drawer's before/after rows, and the only
 * place an AI suggestion is requested (i.e. where a credit is spent).
 */
trait UBS_SEO_Rest_Fix_Preview {

    /**
     * Before → after preview rows for a fix (this is where the AI suggestions are
     * generated, so it can take a few seconds per page).
     */
    public function fix_preview( WP_REST_Request $request ): WP_REST_Response {
        $fix = UBS_SEO_Fixes::for_issue( sanitize_text_field( (string) $request->get_param( 'issue' ) ) );
        if ( ! $fix ) {
            return new WP_REST_Response( [ 'error' => 'This fix has no preview.', 'rows' => [], 'pending' => false ], 200 );
        }

        // Suggestions generate per page. The UI calls in three steps so the
        // preview shows instantly and never blocks: first the page list (no
        // backend call), then one kick-off, then status polls. `start=1` kicks
        // off generation; `poll=1` only reads status (never re-fires generation).
        // 'regenerate' forces a fresh, different suggestion (bypasses the cache,
        // costs 1 credit); it's checked first so it wins over 'start'/'poll'.
        if ( $request->get_param( 'regenerate' ) ) {
            $mode = 'regenerate';
        } elseif ( $request->get_param( 'start' ) ) {
            $mode = 'generate';
        } elseif ( $request->get_param( 'poll' ) ) {
            $mode = 'status';
        } else {
            $mode = 'list';
        }
        $ref = $this->sanitize_ref( (string) $request->get_param( 'ref' ) );

        // The paywall CTA sends refresh_plan=1 on the retry after an
        // upgrade attempt, so a just-paid account isn't held by the cache.
        if ( $request->get_param( 'refresh_plan' ) ) {
            delete_transient( self::FREE_PLAN_TRANSIENT );
        }
        // Server-side backstop for the free-plan paywall: a KNOWN-free
        // account never reaches the chargeable call, whatever the client
        // believed. Unknown stays open — never block a paying user.
        if ( ( 'generate' === $mode || 'regenerate' === $mode ) && true === $this->is_free_plan() ) {
            return new WP_REST_Response( [ 'rows' => [], 'pending' => false, 'freePlan' => true ] );
        }

        $rows = $fix->preview_async( $mode, $ref );

        // A dead account otherwise reads as a plain generation failure.
        $auth_error = UBS_SEO_Api_Client::last_auth_error();
        if ( $auth_error instanceof WP_Error ) {
            return $this->error_response( $auth_error );
        }

        $pending = false;
        foreach ( $rows as $row ) {
            if ( ( $row['status'] ?? '' ) === 'pending' ) {
                $pending = true;
                break;
            }
        }
        $response = [ 'rows' => $rows, 'pending' => $pending ];
        if ( $mode !== 'list' ) {
            $response += $this->project_error_fields();
        } else {
            // Rides on the list step so the drawer knows before the first
            // Generate click; omitted (not false) when undeterminable.
            $free = $this->is_free_plan();
            if ( null !== $free ) {
                $response['freePlan'] = $free;
            }
        }
        // On the list step, tell the UI the credit balance so it can gate the
        // per-page Generate buttons before any (chargeable) generation fires.
        // Rows can mix post-id refs and URL refs (crawl pages with no editable
        // post) — read the balance through whichever kind comes first.
        if ( $mode === 'list' && ! empty( $rows ) ) {
            $credits = null;
            foreach ( $rows as $row ) {
                $row_ref = (string) ( $row['ref'] ?? '' );
                if ( ctype_digit( $row_ref ) ) {
                    $post = get_post( (int) $row_ref );
                    if ( $post instanceof WP_Post ) {
                        $credits = UBS_SEO_Suggestions::credits( $fix->issue_id(), $post );
                        break;
                    }
                    continue;
                }
                // Non-numeric ref: a crawl URL, or the 'home' sentinel whose
                // real URL rides along on the row — always bill by the URL.
                $row_url = (string) ( $row['url'] ?? $row_ref );
                $credits = UBS_SEO_Suggestions::credits_for_url( $fix->issue_id(), $row_url );
                break;
            }
            if ( $credits !== null ) {
                $response['credits'] = $credits;
            }
        }
        return new WP_REST_Response( $response );
    }

}
