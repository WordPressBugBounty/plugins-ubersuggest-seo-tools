<?php
defined( 'ABSPATH' ) || exit;

/**
 * Tracks whether this admin still has to be asked for a WordPress.org review.
 *
 * The ask rides the first fix the user applies — the one moment we know the
 * plugin just did something useful for them. It is stored per USER, not per
 * site: a review is left under a personal wordpress.org account, and one admin
 * dismissing the prompt must not silence it for their colleagues.
 */
class UBS_SEO_Review_Prompt {

    /**
     * Timestamp of the ask, empty while it has never been made.
     *
     * A timestamp rather than a flag so support can tell a never-asked install
     * from one asked long ago, and so the ask can be reset by deleting the meta.
     */
    private const USER_META = 'ubs_seo_review_asked';

    public static function should_ask(): bool {
        return '' === (string) get_user_meta( get_current_user_id(), self::USER_META, true );
    }

    /** Record that the prompt was shown, so it never opens for this user again. */
    public static function mark_asked(): void {
        update_user_meta( get_current_user_id(), self::USER_META, time() );
    }
}
