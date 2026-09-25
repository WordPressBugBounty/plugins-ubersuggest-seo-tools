<?php
defined( 'ABSPATH' ) || exit;

/**
 * The /track endpoint: resolves the Mixpanel identity and relays events
 * through {@link UBS_SEO_Tracking_Client}.
 *
 * Identity mirrors the web app: a connected account is tracked by its email
 * (the id Mixpanel already knows it by); an unconnected install carries a
 * per-install anonymous id and `user_status: "unlogged"` — the exact value
 * the web app uses for logged-out visitors. The two must never blur: a
 * connected account whose email cannot be confirmed right now DROPS the
 * event, because attributing a customer's action to an anonymous id would
 * split their identity in Mixpanel for good.
 */
trait UBS_SEO_Rest_Tracking {

    public function track_event( WP_REST_Request $request ): WP_REST_Response {
        $event = $request->get_param( 'event' );
        $event = is_string( $event ) ? sanitize_text_field( $event ) : '';
        if ( '' === $event ) {
            return $this->dropped_event( 'the event name was missing or not a string' );
        }
        // Both kill switches come BEFORE identity resolution: when the relay
        // is off, an analytics call must not cost a backend round-trip. The
        // filter is the site owner's off switch, disclosed in readme.txt.
        if ( '' === UBS_SEO_UBS_APP_KEY || ! apply_filters( 'ubs_seo_tracking_enabled', true ) ) {
            return new WP_REST_Response( [ 'ok' => true ] );
        }

        $properties = $this->tracking_properties( $request->get_param( 'properties' ) );

        if ( ( new UBS_SEO_OAuth_Client() )->is_connected() ) {
            $identity = $this->connected_identity();
            if ( null === $identity ) {
                return $this->dropped_event( "the connected account's email could not be confirmed" );
            }
            $distinct_id              = $identity['email'];
            $properties['user_email'] = $identity['email'];
            // Resolved with the email, from the same userinfo response, rather
            // than read from the paywall's cache: that one expires in ten
            // minutes and is only ever warmed by the Issues screens, so a Page
            // View from Site Audit would ship with no free/paid dimension at
            // all. Stale by up to the email TTL after an upgrade, which
            // analytics tolerates and an absent field does not.
            if ( null !== $identity['free'] ) {
                $properties['user_status'] = $identity['free'] ? 'free' : 'paid';
            }
        } else {
            $distinct_id               = $this->anonymous_tracking_id();
            $properties['user_status'] = 'unlogged';
        }

        ( new UBS_SEO_Tracking_Client() )->track( $event, $distinct_id, $properties );
        return new WP_REST_Response( [ 'ok' => true ] );
    }

    /**
     * Refuse an event, leaving a trace.
     *
     * `ok: false` rides a 200, so apiPost resolves and the client's `.catch`
     * never fires — without this line a site dropping every event would do it
     * in total silence. The client logs the falsy `ok` for the admin looking
     * at a console; this is for the one reading debug.log, and carries the
     * reason, which only the server knows.
     */
    private function dropped_event( string $reason ): WP_REST_Response {
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug-only trace for an event that is otherwise dropped silently.
            error_log( '[ubs-seo] tracking event dropped: ' . $reason );
        }
        return new WP_REST_Response( [ 'ok' => false ], 200 );
    }

    /**
     * Client-sent properties, reduced to what may pass through: scalar values
     * under safe keys the server does not own. sanitize_key() strips `$`,
     * which REWRITES Mixpanel's reserved names into the bare spellings the
     * Python client seeds internally (`$distinct_id` → `distinct_id`) — and
     * that client lets caller properties override its seeds. So the reserved
     * list must block the bare spellings too, or a caller could reassign the
     * event's identity, project token or timestamp.
     */
    private function tracking_properties( $raw ): array {
        if ( ! is_array( $raw ) ) {
            return [];
        }
        $reserved = [
            // Stamped by the plugin or by the relay.
            'channel',
            'plugin_version',
            'user_email',
            'user_status',
            'ip',
            // Seeded inside the Mixpanel Python client; a caller copy wins there.
            'distinct_id',
            'token',
            'time',
            'insert_id',
            'mp_lib',
            'lib_version',
        ];
        $clean = [];
        foreach ( $raw as $key => $value ) {
            $key = sanitize_key( (string) $key );
            if ( '' === $key || in_array( $key, $reserved, true ) || ! is_scalar( $value ) ) {
                continue;
            }
            $clean[ $key ] = is_string( $value ) ? sanitize_text_field( $value ) : $value;
        }
        return $clean;
    }

    /**
     * Who the connected account is, for attribution: its email and whether it
     * is on a free plan. Null when the backend could not confirm it just now —
     * negative-cached for a few minutes, so an outage costs one round-trip
     * rather than one per event. Call only when is_connected(); the caller
     * owns the connected/anonymous branch.
     *
     * Both facts live in ONE entry on purpose. They come from a single
     * userinfo response, and holding the plan verdict in the paywall's
     * shorter-lived transient instead meant `user_status` quietly vanished
     * from events ten minutes after the last Issues screen.
     *
     * @return array{email: string, free: ?bool}|null
     */
    private function connected_identity(): ?array {
        $cached = get_transient( self::USER_EMAIL_TRANSIENT );
        // 'none' is the negative-cache marker: a recent lookup failed.
        if ( 'none' === $cached ) {
            return null;
        }
        if ( is_array( $cached ) && ! empty( $cached['email'] ) ) {
            return $cached;
        }
        $response = ( new UBS_SEO_Api_Client() )->get_user_info();
        $email    = '';
        $body     = is_wp_error( $response ) ? null : ( $response['body'] ?? null );
        if ( ! is_wp_error( $response ) && 200 === (int) ( $response['status'] ?? 0 ) && ! empty( $body['email'] ) ) {
            $email = sanitize_email( (string) $body['email'] );
        }
        if ( '' === $email ) {
            set_transient( self::USER_EMAIL_TRANSIENT, 'none', 5 * MINUTE_IN_SECONDS );
            return null;
        }
        // The same response answers the paywall's question too; warming its
        // cache here spares the next Issues load a round-trip.
        $identity = [ 'email' => $email, 'free' => $this->cache_plan_verdict( $body ) ];
        set_transient( self::USER_EMAIL_TRANSIENT, $identity, 12 * HOUR_IN_SECONDS );
        return $identity;
    }

    /**
     * Stable anonymous identity for unconnected installs — the plugin's twin
     * of the device id the web app's Mixpanel SDK persists for logged-out
     * visitors. One id per install, created on first use, removed by
     * uninstall.php.
     */
    private function anonymous_tracking_id(): string {
        $tracking_id = get_option( self::DEVICE_ID_OPTION );
        if ( is_string( $tracking_id ) && '' !== $tracking_id ) {
            return $tracking_id;
        }
        $tracking_id = wp_generate_uuid4();
        if ( ! add_option( self::DEVICE_ID_OPTION, $tracking_id, '', false ) ) {
            // Lost a first-event race: the winner's id is the install's id.
            $stored = get_option( self::DEVICE_ID_OPTION );
            if ( is_string( $stored ) && '' !== $stored ) {
                return $stored;
            }
        }
        return $tracking_id;
    }

}
