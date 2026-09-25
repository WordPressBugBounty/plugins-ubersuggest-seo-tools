<?php
defined( 'ABSPATH' ) || exit;

/**
 * Shared request/response plumbing: ref sanitizing, approved-value parsing,
 * error payloads and the plan/project fields the UI needs alongside them.
 */
trait UBS_SEO_Rest_Support {

    /**
     * Sanitize a preview `ref`: a post id, a crawl URL, or a sentinel ('home').
     *
     * Each kind needs its own treatment. A URL must NOT go through
     * sanitize_text_field (it strips percent-encoded octets, so an accented-slug
     * URL would never match its row again), and a sentinel must NOT go through
     * esc_url_raw (WordPress prefixes a schemeless string with http://, turning
     * 'home' into 'http://home' — which then matches nothing).
     */
    private function sanitize_ref( string $ref ): string {
        if ( ctype_digit( $ref ) ) {
            return $ref;
        }
        if ( preg_match( '#^https?://#i', $ref ) ) {
            return esc_url_raw( wp_unslash( $ref ) );
        }
        return sanitize_key( $ref );
    }

    /** Sanitize the preview values the UI sends with apply: post id => text. */
    private function approved_values( $values ): array {
        if ( ! is_array( $values ) ) {
            return [];
        }
        $clean = [];
        foreach ( $values as $ref => $text ) {
            if ( is_string( $text ) ) {
                $clean[ (string) $ref ] = sanitize_text_field( $text );
            }
        }
        return $clean;
    }

    /**
     * Per-ref origin of each approved value, for the fix history. Only 'edited'
     * is meaningful — anything else (missing, mistyped, forged) falls back to
     * 'ai' in the fix, so the client can't write arbitrary strings into the log.
     *
     * @param mixed $sources raw `sources` request param
     * @return array<string,string>
     */
    private function value_sources( $sources ): array {
        if ( ! is_array( $sources ) ) {
            return [];
        }
        $clean = [];
        foreach ( $sources as $ref => $source ) {
            if ( $source === 'edited' ) {
                $clean[ (string) $ref ] = 'edited';
            }
        }
        return $clean;
    }

    /**
     * Error payload for the UI's load paths.
     *
     * A missing or dead account is not a failure the user can retry away, so it
     * travels as its own flag plus the wp-admin page that fixes it — the UI
     * renders a Connect screen instead of a "couldn't load" line the reader can do
     * nothing about.
     *
     * @return WP_REST_Response `expired` tells a session that DROPPED from a site
     * that never connected, so the screen can ask to re-connect. Not an edge case:
     * is_connected() only proves an access token was once stored, so a dead
     * refresh token is the likeliest way an account stops working.
     */
    private function error_response( WP_Error $error ): WP_REST_Response {
        $code = $error->get_error_code();
        if ( array_key_exists( $code, UBS_SEO_Api_Client::AUTH_ERROR_EXPIRED ) ) {
            return new WP_REST_Response( [
                'notConnected' => true,
                'expired'      => UBS_SEO_Api_Client::AUTH_ERROR_EXPIRED[ $code ],
                // Straight to the OAuth kick-off: the wp-admin settings page is
                // gone, the app owns connecting now.
                'connectUrl'   => $this->connect_url(),
            ], 200 );
        }
        return new WP_REST_Response( [ 'error' => $error->get_error_message() ], 200 );
    }

    /**
     * Whether the connected account has NO active subscription (free, or
     * lapsed). Gates the free-trial paywall, so unknown must stay unknown —
     * a backend hiccup must never paywall a paying user. Cached briefly.
     */
    private function is_free_plan(): ?bool {
        $cached = get_transient( self::FREE_PLAN_TRANSIENT );
        if ( 'yes' === $cached || 'no' === $cached ) {
            return 'yes' === $cached;
        }
        $response = ( new UBS_SEO_Api_Client() )->get_user_info();
        if ( is_wp_error( $response ) || 200 !== (int) ( $response['status'] ?? 0 ) || ! is_array( $response['body'] ?? null ) ) {
            return null;
        }
        return $this->cache_plan_verdict( $response['body'] );
    }

    /**
     * The free-vs-paid rule and its cache, in one place: no active
     * subscription means free. Written here, read by the paywall and by the
     * tracking path alike, so a rule or TTL change has a single owner.
     */
    private function cache_plan_verdict( array $body ): bool {
        $free = empty( $body['subscription'] );
        set_transient( self::FREE_PLAN_TRANSIENT, $free ? 'yes' : 'no', 10 * MINUTE_IN_SECONDS );
        return $free;
    }

    /**
     * Extra response fields when AI is unavailable because no UBS project could
     * be resolved for this site. A create rejected on the PLAN LIMIT becomes a
     * structured `projectRequired` payload the drawer renders as the buy-add-on
     * paywall; any other failure stays a plain error message. Empty when the
     * project resolved fine.
     */
    private function project_error_fields(): array {
        $error = UBS_SEO_Project::last_error();
        if ( ! $error instanceof WP_Error ) {
            return [];
        }
        if ( 'ubs_seo_project_limit' === $error->get_error_code() ) {
            return [
                'projectRequired' => [
                    'domain'            => UBS_SEO_Project::domain(),
                    'manageProjectsUrl' => UBS_SEO_App_Page::app_url( '/project/settings', 'project_paywall_manage' ),
                    'upgradeUrl'        => UBS_SEO_App_Page::app_url( '/settings/account_billing', 'project_paywall' ),
                ],
            ];
        }
        return [ 'error' => $error->get_error_message() ];
    }

    /** @param true|WP_Error $result */
    private function fix_result( $result ): WP_REST_Response {
        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [ 'ok' => false, 'error' => $result->get_error_message() ], 200 );
        }
        return new WP_REST_Response( [ 'ok' => true ] );
    }

}
