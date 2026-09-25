<?php
defined( 'ABSPATH' ) || exit;

/**
 * Site Speed (Core Web Vitals) data layer. Mirrors UBS_SEO_Audit_Service: the
 * REST controller stays thin and delegates the backend round-trip here.
 *
 * Returns the backend's { done, report } verbatim — the React card does the
 * metric extraction (CrUX field data → Lighthouse lab fallback) and the bar
 * math, matching ubersuggest-next's client-side model.
 */
class UBS_SEO_Page_Speed_Service {

    /**
     * Fetch Core Web Vitals for $domain. Async on the backend, so the caller
     * polls until `done` is true (the first call auto-triggers the audit).
     *
     * @return array{done:bool, report:array}|WP_Error
     */
    public static function fetch( string $domain, bool $force = false ) {
        $response = ( new UBS_SEO_Api_Client() )->get_pagespeed_audit( $domain, $force );
        if ( is_wp_error( $response ) ) {
            return $response;
        }
        if ( (int) ( $response['status'] ?? 0 ) !== 200 || ! is_array( $response['body'] ?? null ) ) {
            return new WP_Error(
                'ubs_seo_pagespeed_http',
                /* translators: %d: HTTP status code returned by the Ubersuggest API. */
                sprintf( __( 'Site Speed request failed (HTTP %d).', 'ubersuggest-seo-tools' ), (int) ( $response['status'] ?? 0 ) )
            );
        }

        $body = $response['body'];
        return [
            'done'   => (bool) ( $body['done'] ?? false ),
            'report' => is_array( $body['report'] ?? null ) ? $body['report'] : [],
        ];
    }
}
