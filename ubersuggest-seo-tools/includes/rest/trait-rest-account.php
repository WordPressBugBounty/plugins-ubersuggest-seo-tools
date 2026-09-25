<?php
defined( 'ABSPATH' ) || exit;

/**
 * Account endpoints: connection state, the nonce'd OAuth start URL, the
 * disconnect action, and the read-only settings the UI renders.
 */
trait UBS_SEO_Rest_Account {

    /**
     * Current Ubersuggest connection state for the UI's header / connect gate.
     */
    public function connection(): WP_REST_Response {
        $oauth     = new UBS_SEO_OAuth_Client();
        $connected = $oauth->is_connected();

        return new WP_REST_Response( [
            'connected'  => $connected,
            'scope'      => $connected ? $oauth->granted_scope() : '',
            'missingScopes' => $connected ? $oauth->missing_scopes() : [],
            'connectUrl' => $this->connect_url(),
        ] );
    }

    /**
     * Nonce'd admin-post URL that kicks off the OAuth flow (see
     * UBS_SEO_App_Page::handle_oauth_connect). html_entity_decode because
     * wp_nonce_url encodes & as &amp; for HTML display, but this URL is consumed
     * as JSON and assigned to window.location by the React app, where the
     * entity would mangle the nonce param.
     */
    private function connect_url(): string {
        return html_entity_decode( wp_nonce_url(
            admin_url( 'admin-post.php?action=ubs_seo_oauth_connect' ),
            'ubs_seo_oauth_connect'
        ) );
    }

    /**
     * Disconnect the Ubersuggest account: revoke the token on the backend and
     * clear everything local that presumes one (tokens, cached plan verdict,
     * project id). The React settings page calls this only after the user
     * confirms in a dialog that states the consequence — the endpoint itself
     * stays a plain authenticated action.
     */
    public function disconnect_account(): WP_REST_Response {
        ( new UBS_SEO_OAuth_Client() )->disconnect();
        return new WP_REST_Response( [ 'ok' => true ] );
    }

    /**
     * Settings the React UI reads. Both audit fields are read-only:
     * - domain: locked to THIS site's domain (we audit the site the plugin runs on)
     * - crawlFrequency: fixed weekly project update on the backend
     *
     * No backend call: fetching here would block every Settings load and could
     * even TRIGGER a crawl on a never-crawled site (fetch_audit's first-use path
     * starts one).
     */
    public function get_settings(): WP_REST_Response {
        return new WP_REST_Response( [
            'domain'           => UBS_SEO_Project::domain(),
            'crawlFrequency'   => 'weekly',
            // Straight to the pricing comparison table (#pricing-table is the
            // anchor Ubersuggest scrolls to), where the Site Audit row spells out
            // the weekly page cap on every plan.
            'planUrl'          => UBS_SEO_App_Page::app_url( '/pricing#pricing-table', 'settings' ),
            // Notification preferences are per-account, not per-site, so the UI
            // links out to Ubersuggest instead of storing anything locally.
            'notificationsUrl' => UBS_SEO_App_Page::app_url( '/settings/notifications', 'settings_notifications' ),
        ] );
    }

}
