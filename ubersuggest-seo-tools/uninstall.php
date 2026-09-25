<?php
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

// Only account/connection state and crawl caches are removed. Applied fixes
// are real changes to the site's content and must outlive the plugin — an
// uninstall (including uninstall-to-swap-versions) must never undo a fix or
// forget that it was applied, so reinstalling picks up exactly where it left.
delete_option( 'ubs_seo_settings' );
delete_option( 'ubs_seo_oauth_tokens' );
delete_option( 'ubs_seo_project_id' );
delete_option( 'ubs_seo_crawl_max_pages' );
delete_option( 'ubs_seo_breakdown_gen' );
delete_option( 'ubs_seo_last_crawled_ms' );
delete_option( 'ubs_seo_audit_snapshot' );
delete_option( 'ubs_seo_audit_snapshot_previous' );
delete_option( 'ubs_seo_device_id' );
delete_transient( 'ubs_seo_user_email' );
delete_metadata( 'user', 0, 'ubs_seo_review_asked', '', true );
foreach ( is_multisite() ? get_sites( [ 'fields' => 'ids', 'number' => 0 ] ) : [ 0 ] as $ubs_seo_blog_id ) {
    delete_metadata(
        'user',
        0,
        $wpdb->get_blog_prefix( $ubs_seo_blog_id ) . 'ubs_seo_notice_dismissed_at',
        '',
        true
    );
}

// Intentionally kept:
//   ubs_seo_applied_fixes           — ledger of which fixes were applied
//   ubs_seo_home_title / _description — the homepage fix itself (site-level, no post to attach it to)
//   wp_ubs_seo_fix_history (+ ubs_seo_fix_history_schema) — the fix audit log.
//     Its previous-value column is the ONLY copy of what each page held before
//     a fix; dropping it would destroy the revert path for values the fixes
//     left behind on the site. A reinstall picks the history right back up.
