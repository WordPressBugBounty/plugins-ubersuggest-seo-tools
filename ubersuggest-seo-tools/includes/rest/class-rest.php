<?php
defined( 'ABSPATH' ) || exit;

/**
 * REST API consumed by the React UI. The plugin is headless: PHP owns auth and
 * the backend round-trips, and exposes them as JSON here; the @ubersuggest/ui
 * front end (mounted by UBS_SEO_App_Page) is the only thing the user sees.
 *
 * This is the controller layer — routing + shaping responses. The audit data
 * logic lives in UBS_SEO_Audit_Service, and fixes in UBS_SEO_Fixes.
 *
 * Auth: cookie + the wp_rest nonce the app page hands the iframe. Every route is
 * restricted to manage_options — the same capability that gates the admin pages.
 */
class UBS_SEO_Rest {

    // One trait per resource, each in its own file. routes() below stays the
    // single map of the REST surface, so what the app can call is readable
    // in one place.
    use UBS_SEO_Rest_Support;
    use UBS_SEO_Rest_Account;
    use UBS_SEO_Rest_Audit;
    use UBS_SEO_Rest_Issues;
    use UBS_SEO_Rest_Fix_Preview;
    use UBS_SEO_Rest_Issue_Pages;
    use UBS_SEO_Rest_Page_Recrawl;
    use UBS_SEO_Rest_Fix_Apply;
    use UBS_SEO_Rest_History;
    use UBS_SEO_Rest_Tracking;

    public const NAMESPACE = 'ubs-seo/v1';

    /** Cached free-vs-paid verdict; cleared on token change and paywall retry. */
    public const FREE_PLAN_TRANSIENT = 'ubs_seo_free_plan';

    /** Cached email of the connected account; cleared with the plan verdict. */
    public const USER_EMAIL_TRANSIENT = 'ubs_seo_user_email';

    /** Per-install anonymous Mixpanel id, used until an account connects. */
    public const DEVICE_ID_OPTION = 'ubs_seo_device_id';

    public function register(): void {
        add_action( 'rest_api_init', [ $this, 'routes' ] );
    }

    public function routes(): void {
        register_rest_route( self::NAMESPACE, '/connection', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'connection' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/connection/disconnect', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'disconnect_account' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/audit', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'audit' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/audit/cancel', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'cancel_audit' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/pagespeed', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'pagespeed' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/settings', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_settings' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/overview-metrics', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'overview_metrics' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/issues', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'issues' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/issue-pages', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'issue_pages' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/fix/preview', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'fix_preview' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/fix/apply', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'fix_apply' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/history', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'history_list' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/history/revert', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'history_revert' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/page-recrawl', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'page_recrawl' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/review-prompt', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'review_prompt_shown' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
        register_rest_route( self::NAMESPACE, '/track', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'track_event' ],
            'permission_callback' => [ $this, 'can_manage' ],
        ] );
    }

    public function can_manage(): bool {
        return current_user_can( 'manage_options' );
    }

}
