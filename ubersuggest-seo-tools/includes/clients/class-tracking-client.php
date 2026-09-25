<?php
defined( 'ABSPATH' ) || exit;

/**
 * Sends Mixpanel events through the backend's tracking relay.
 *
 * The web app never talks to Mixpanel from the browser: it signs
 * `{event, properties}` as an HS256 JWT and POSTs it to `/api/user_action`,
 * which forwards everything verbatim to Mixpanel (backend
 * handlers/mixpanel.py). This client is the PHP twin of that path, which also
 * keeps the readme.txt "External services" promise: every request leaves this
 * server, never the admin's browser.
 *
 * Fire-and-forget by design: nothing here throws, and the response is never
 * read. Note `blocking => false` does NOT make the request asynchronous —
 * WordPress's curl transport still runs the full round-trip inline, the flag
 * only skips response handling — so the 1-second timeout below is the worst
 * case an event can add to the admin request carrying it.
 */
class UBS_SEO_Tracking_Client {

    /**
     * Origin tag on every event, mirroring the MCP's `channel: "mcp"`. The
     * web app sends no channel, so absent = webapp.
     */
    public const CHANNEL = 'wordpress-plugin';

    /**
     * Track one event. No-op when UBS_SEO_UBS_APP_KEY is empty — the dev
     * off-switch (.wp-env.json), the same way the web app disables tracking
     * by leaving its token unset.
     *
     * @param string $distinct_id Mixpanel identity: the connected account's
     *                            email, or the per-install anonymous id. The
     *                            relay rejects events without one.
     * @param array  $properties  Event properties. The channel, plugin
     *                            version and identity are stamped over them,
     *                            last, so a caller cannot override them.
     */
    public function track( string $event, string $distinct_id, array $properties = [] ): void {
        if ( '' === UBS_SEO_UBS_APP_KEY || '' === $event || '' === $distinct_id ) {
            return;
        }
        $properties = array_merge( $properties, [
            'channel'        => self::CHANNEL,
            'plugin_version' => UBS_SEO_VERSION,
            '$distinct_id'   => $distinct_id,
        ] );
        wp_remote_post( untrailingslashit( UBS_SEO_DEFAULT_BASE_URL ) . '/api/user_action', [
            'timeout'  => 1,
            'blocking' => false,
            'headers'  => [ 'Content-Type' => 'application/json' ],
            'body'     => wp_json_encode( [
                'data' => $this->jwt_encode( [ 'event' => $event, 'properties' => $properties ] ),
            ] ),
        ] );
    }

    /**
     * HS256 JWT, inline. The relay verifies only the signature and the
     * `{event, properties}` shape — no exp/iat claims — so the three
     * base64url segments below are the whole spec and a JWT library would be
     * a dependency for nothing.
     */
    private function jwt_encode( array $payload ): string {
        $segments = [
            self::base64url_encode( (string) wp_json_encode( [ 'alg' => 'HS256', 'typ' => 'JWT' ] ) ),
            self::base64url_encode( (string) wp_json_encode( $payload ) ),
        ];
        $signature  = hash_hmac( 'sha256', implode( '.', $segments ), UBS_SEO_UBS_APP_KEY, true );
        $segments[] = self::base64url_encode( $signature );
        return implode( '.', $segments );
    }

    /**
     * URL-safe base64 without padding. The one copy in the plugin: JWT
     * segments here, PKCE in {@link UBS_SEO_OAuth_Client}, and the
     * integration test's signature check all share it.
     */
    public static function base64url_encode( string $bytes ): string {
        // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- JWT/PKCE segments are base64url by definition, not obfuscation.
        return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' );
    }

    /**
     * The `{event, properties}` payload of a relay JWT, or null for anything
     * that is not a three-segment token. The signature is NOT checked — this
     * exists so the integration test and the dev logger read what was sent
     * without re-implementing the decode; it authenticates nothing.
     */
    public static function jwt_decode_payload( string $jwt ): ?array {
        $segments = explode( '.', $jwt );
        if ( 3 !== count( $segments ) ) {
            return null;
        }
        // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- decoding a JWT segment, not executing hidden code.
        $payload = json_decode( (string) base64_decode( strtr( $segments[1], '-_', '+/' ) ), true );
        return is_array( $payload ) ? $payload : null;
    }
}
