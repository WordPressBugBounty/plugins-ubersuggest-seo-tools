<?php
/**
 * Plugin Name: Ubersuggest SEO Tools
 * Description: Ubersuggest SEO tools inside WordPress: site audit, Core Web Vitals, and AI-generated fixes for your website.
 * Version:     1.2.2
 * Requires PHP: 8.0
 * Requires at least: 6.0
 * Author:      Ubersuggest
 * License:     GPL-3.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain: ubersuggest-seo-tools
 * Domain Path: /languages
 */

defined( 'ABSPATH' ) || exit;

define( 'UBS_SEO_VERSION', '1.2.2' );
define( 'UBS_SEO_PATH', plugin_dir_path( __FILE__ ) );
define( 'UBS_SEO_URL', plugin_dir_url( __FILE__ ) );
define( 'UBS_SEO_OPTION_KEY', 'ubs_seo_settings' );

// The one backend host, for REST calls and OAuth alike. No `/api` suffix here —
// every caller appends its own `/api/…`.
//
// OAuth rides this same host: the backend accepts a per-site redirect_uri for
// public clients whose code is bound to a PKCE S256 challenge, so the
// wordpress-oauth broker that used to own the one whitelisted redirect is gone.
// See UBS_SEO_OAuth_Client.
//
// Read ONLY from here, never from the ubs_seo_settings option. The activation
// hook used to seed the option with this value, which then shadowed the
// constant forever: the settings page stopped exposing the field, so a stage
// switch could never reach an already-activated install. Same trap that killed
// `oauth_base` — an install that stored a host kept talking to it.
define( 'UBS_SEO_DEFAULT_BASE_URL', 'https://ubersuggest.com' );
// Ubersuggest web app — where we deep-link the user to check/upgrade their plan.
define( 'UBS_SEO_APP_URL', 'https://ubersuggest.com' );

if ( ! defined( 'UBS_SEO_UBS_APP_KEY' ) ) {
    define( 'UBS_SEO_UBS_APP_KEY', '610881cbe73587a76566387c41c1c67a9cdfa1d2d0369d995a2f4eac8d069718' );
}

require_once UBS_SEO_PATH . 'includes/clients/class-oauth-client.php';
require_once UBS_SEO_PATH . 'includes/clients/class-api-client.php';
require_once UBS_SEO_PATH . 'includes/clients/class-tracking-client.php';
require_once UBS_SEO_PATH . 'includes/class-issue-labels.php';
require_once UBS_SEO_PATH . 'includes/class-project.php';
require_once UBS_SEO_PATH . 'includes/class-seo-meta.php';
require_once UBS_SEO_PATH . 'includes/class-seo-meta-store.php';
require_once UBS_SEO_PATH . 'includes/class-suggestions.php';
require_once UBS_SEO_PATH . 'includes/class-fix-history.php';
require_once UBS_SEO_PATH . 'includes/class-fix-revert.php';
require_once UBS_SEO_PATH . 'includes/fixes/interfaces.php';
require_once UBS_SEO_PATH . 'includes/fixes/trait-crawl-targets.php';
require_once UBS_SEO_PATH . 'includes/fixes/trait-home-target.php';
require_once UBS_SEO_PATH . 'includes/fixes/trait-history-recording.php';
require_once UBS_SEO_PATH . 'includes/fixes/trait-preview-rows.php';
require_once UBS_SEO_PATH . 'includes/fixes/trait-fix-status.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-ai-content-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-meta-description-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-title-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-title-length-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-title-short-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-title-empty-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-h1-fix.php';
require_once UBS_SEO_PATH . 'includes/fixes/class-fixes.php';
require_once UBS_SEO_PATH . 'includes/class-review-prompt.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-fetch.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-breakdown.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-page-map.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-urls.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-post-resolver.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-recrawl.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-verdict.php';
require_once UBS_SEO_PATH . 'includes/trait-audit-ui-mapping.php';
require_once UBS_SEO_PATH . 'includes/class-audit-service.php';
require_once UBS_SEO_PATH . 'includes/class-page-speed-service.php';
require_once UBS_SEO_PATH . 'includes/class-audit-snapshot.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-support.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-account.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-audit.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-issues.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-fix-preview.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-issue-pages.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-page-recrawl.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-fix-apply.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-history.php';
require_once UBS_SEO_PATH . 'includes/rest/trait-rest-tracking.php';
require_once UBS_SEO_PATH . 'includes/rest/class-rest.php';
require_once UBS_SEO_PATH . 'includes/class-app-page.php';
require_once UBS_SEO_PATH . 'includes/class-admin-brand.php';
require_once UBS_SEO_PATH . 'includes/class-audit-notice.php';
require_once UBS_SEO_PATH . 'includes/class-dashboard-widget.php';

// Development-only stand-in for the backend Site Audit, so the fix loop can be
// exercised against a localhost site the crawler cannot reach. It lives under
// dev/, which the release allowlist (scripts/package.sh) does not copy, so the
// distributed plugin never carries it — UBS_SEO_Audit_Service::mock_enabled()
// treats the absence as "no mock" rather than a fatal.
if ( file_exists( UBS_SEO_PATH . 'dev/class-local-audit.php' ) ) {
    require_once UBS_SEO_PATH . 'dev/class-local-audit.php';
}

register_activation_hook( __FILE__, static function () {
    if ( false === get_option( UBS_SEO_OPTION_KEY ) ) {
        // Only api_key: it is a per-install credential. The backend host is
        // resolved from UBS_SEO_DEFAULT_BASE_URL at runtime and must NOT be
        // frozen here, or changing the constant would never reach this site.
        add_option( UBS_SEO_OPTION_KEY, [ 'api_key' => '' ] );
    }
    UBS_SEO_Fix_History::maybe_create_table();
} );

// Activation alone misses plugin UPDATES; admin_init and rest_api_init re-check
// the schema version (one cached option read) so an updated install gets the
// table too. rest_api_init matters on its own: the table's writers are REST
// handlers, and a background auto-update can land while an admin tab is open —
// its next REST call must not run new code against a missing table.
add_action( 'admin_init', [ UBS_SEO_Fix_History::class, 'maybe_create_table' ] );
add_action( 'rest_api_init', [ UBS_SEO_Fix_History::class, 'maybe_create_table' ] );

register_deactivation_hook( __FILE__, static function () {
    // Intentionally empty: keep settings on deactivate. Uninstall cleans them up.
} );

// Core already serves whatever translate.wordpress.org has built, out of
// wp-content/languages/plugins/, without being asked. The bundled /languages is
// a FALLBACK under it, not a replacement: WP_Textdomain_Registry searches
// WP_LANG_DIR first and a plugin's own path last, so a community translation
// always wins over ours. It exists because this plugin is new to the directory
// and every locale sits at 0% — without it the dashboard widget and the audit
// notice, which are rendered by PHP outside the React app's i18n, would read
// English to everyone. Drop the /languages folder once the locales fill in.
add_action( 'plugins_loaded', static function () {
    load_plugin_textdomain(
        'ubersuggest-seo-tools',
        false,
        dirname( plugin_basename( __FILE__ ) ) . '/languages'
    );
    ( new UBS_SEO_Meta() )->register();
    ( new UBS_SEO_Rest() )->register();
    ( new UBS_SEO_App_Page() )->register();
    ( new UBS_SEO_Audit_Notice() )->register();
    ( new UBS_SEO_Dashboard_Widget() )->register();
} );
