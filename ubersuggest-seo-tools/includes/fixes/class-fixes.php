<?php
defined( 'ABSPATH' ) || exit;

/**
 * Registry of available fixes, keyed by the Site Audit issue id they resolve.
 */
class UBS_SEO_Fixes {

    /** @return UBS_SEO_AI_Content_Fix[] */
    public static function all(): array {
        return [
            new UBS_SEO_Meta_Description_Fix(),
            new UBS_SEO_Title_Length_Fix(),
            new UBS_SEO_Title_Short_Fix(),
            new UBS_SEO_Title_Empty_Fix(),
            new UBS_SEO_H1_Fix(),
        ];
    }

    /** A fix for the given Site Audit issue id, or null if none exists. */
    public static function for_issue( string $issue_id ): ?UBS_SEO_AI_Content_Fix {
        foreach ( self::all() as $fix ) {
            if ( $fix->issue_id() === $issue_id ) {
                return $fix;
            }
        }
        return null;
    }

    /**
     * Issues this plugin has applied a fix for, so the SEO Issues list can keep
     * showing them (resolved, in the Fixed tab) after the crawl stops flagging
     * them — a fixed issue disappears from the crawl report on the next crawl,
     * and without this record it would silently vanish instead of moving to
     * the Fixed tab.
     */
    private const APPLIED_OPTION = 'ubs_seo_applied_fixes';

    /** Remember that we applied a fix for this issue. */
    public static function record_applied( string $issue_id ): void {
        $applied = get_option( self::APPLIED_OPTION, [] );
        if ( ! is_array( $applied ) ) {
            $applied = [];
        }
        $applied[ $issue_id ] = time();
        update_option( self::APPLIED_OPTION, $applied, false );
    }

    /** Drop an issue from the applied ledger — its fix was reverted. */
    public static function forget_applied( string $issue_id ): void {
        $applied = get_option( self::APPLIED_OPTION, [] );
        if ( is_array( $applied ) && isset( $applied[ $issue_id ] ) ) {
            unset( $applied[ $issue_id ] );
            update_option( self::APPLIED_OPTION, $applied, false );
        }
    }

    /** @return string[] issue ids this plugin has applied fixes for */
    public static function applied_issue_ids(): array {
        $applied = get_option( self::APPLIED_OPTION, [] );
        return is_array( $applied ) ? array_map( 'strval', array_keys( $applied ) ) : [];
    }
}
