<?php
defined( 'ABSPATH' ) || exit;

/**
 * Resolves the UBS project that this WordPress site maps to.
 *
 * The AI fix endpoint is keyed to a project_id (and checks the page URL belongs
 * to the project's domain), while Site Audit itself is domain-based. So before
 * we can ask for AI suggestions we need a project for this site's domain — we
 * look one up by domain and, if absent, create it.
 *
 * Resolution is memoized for the request so a screen that asks per page (e.g. a
 * multi-row preview) only hits the network once. The id is also persisted, so
 * after the first success it costs nothing.
 *
 * Both calls require the `projects` OAuth scope; if it wasn't granted (or the
 * account is at its project limit), resolution returns null and generation
 * reports it can't run.
 */
class UBS_SEO_Project {

    private const OPTION = 'ubs_seo_project_id';

    /** Per-request memo of the read-only lookup. */
    private static bool $lookup_done = false;
    private static ?string $lookup_id = null;
    private static bool $lookup_error = false;
    /** Per-request memo of a create attempt. */
    private static bool $create_done = false;

    /**
     * Why resolution failed this request, for callers that would otherwise
     * report a bare failure and hide the cause — e.g. the account's project
     * limit is reached, so AI can't work at all until a slot frees up.
     */
    private static ?WP_Error $last_error = null;

    public static function last_error(): ?WP_Error {
        return self::$last_error;
    }

    /** This site's domain, www-stripped, as used for the project. */
    public static function domain(): string {
        $host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
        return preg_replace( '/^www\./i', '', strtolower( $host ) );
    }

    /**
     * Project id for this site if one already exists (cached, or one network
     * lookup per request). Read-only — never creates. Null if not found, the
     * scope is missing, or the backend is unreachable.
     */
    public static function resolve_id(): ?string {
        if ( self::$lookup_done ) {
            return self::$lookup_id;
        }
        self::$lookup_done = true;

        $cached = get_option( self::OPTION, '' );
        if ( is_string( $cached ) && $cached !== '' ) {
            return self::$lookup_id = $cached;
        }

        $found = ( new UBS_SEO_Api_Client() )->find_project_id( self::domain() );
        if ( is_wp_error( $found ) ) {
            self::$lookup_error = true; // scope/transport — don't bother creating
            self::$last_error   = $found;
            return self::$lookup_id = null;
        }
        if ( is_string( $found ) && $found !== '' ) {
            update_option( self::OPTION, $found, false );
            self::$last_error = null;
            return self::$lookup_id = $found;
        }
        return self::$lookup_id = null; // cleanly absent
    }

    /**
     * Project id for this site, creating one if none exists yet. Use this on the
     * paths that actually need AI (preview/apply); the create is attempted at
     * most once per request and only when the lookup reached the backend cleanly.
     */
    public static function ensure_id(): ?string {
        $id = self::resolve_id();
        if ( $id !== null ) {
            return $id;
        }
        if ( self::$lookup_error || self::$create_done ) {
            return null; // unreachable/unauthorized, or already tried this request
        }
        self::$create_done = true;

        $created = ( new UBS_SEO_Api_Client() )->create_project( self::domain(), get_bloginfo( 'name' ) ?: self::domain() );
        if ( is_wp_error( $created ) ) {
            self::$last_error = $created;
            return null;
        }
        update_option( self::OPTION, $created, false );
        self::$last_error = null;
        return self::$lookup_id = $created;
    }

    /** Forget the cached id and per-request memo (e.g. on disconnect). */
    public static function clear(): void {
        delete_option( self::OPTION );
        self::$lookup_done  = false;
        self::$lookup_id    = null;
        self::$lookup_error = false;
        self::$create_done  = false;
        self::$last_error   = null;
    }
}
