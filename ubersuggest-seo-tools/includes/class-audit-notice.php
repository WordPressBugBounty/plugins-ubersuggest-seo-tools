<?php
defined( 'ABSPATH' ) || exit;

/**
 * A nudge back to the audit, on the Dashboard and the Plugins list, when this
 * site has never been analysed or its last analysis has gone stale.
 *
 * Deliberately narrow: no upsell, one message at a time, and only on the two
 * screens where "go run an audit" is a reasonable interruption — the
 * WordPress.org review treats a plugin that decorates every admin screen as a
 * defect.
 */
class UBS_SEO_Audit_Notice {

    /**
     * When this user last dismissed the notice.
     *
     * Read and written through the user-OPTION API, which scopes it to the
     * current site. Per user because one admin snoozing must not silence their
     * colleagues; per site because plain user meta is one network-wide table on
     * multisite, and a dismissal on one site would hide the first-run panel on
     * every other.
     */
    private const USER_OPTION = 'ubs_seo_notice_dismissed_at';

    /**
     * An audit older than this many days is stale, and a dismissal lasts the
     * same span — re-asking sooner than the staleness it complains about would
     * re-open a question the user just answered.
     */
    private const STALE_DAYS = 7;

    /**
     * The plugin's own page is deliberately absent: every message here says
     * "open the plugin", which is noise for someone already looking at it.
     */
    private const SCREENS = [ 'dashboard', 'plugins' ];

    public function register(): void {
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_style' ] );
        add_action( 'admin_notices', [ $this, 'render' ] );
        add_action( 'admin_post_ubs_seo_dismiss_notice', [ $this, 'dismiss' ] );
    }

    /** Rides `common`, already on every admin screen, so this adds no request. */
    public function enqueue_style(): void {
        if ( null === self::nudge_to_show() ) {
            return;
        }

        wp_add_inline_style(
            'common',
            '.wp-core-ui .ubs-seo-notice{display:flex;gap:18px;align-items:flex-start;'
            . 'margin:5px 0 15px;padding:20px;background:#fff;border:1px solid ' . UBS_SEO_Admin_Brand::LINE . ';'
            . 'border-inline-start:6px solid ' . UBS_SEO_Admin_Brand::PRIMARY . ';border-radius:8px;box-shadow:0 1px 2px rgba(10,10,10,.06)}'
            . '.wp-core-ui .ubs-seo-notice img{flex:none;width:56px;height:56px}'
            . '.wp-core-ui .ubs-seo-notice p{margin:0;font-size:13px;line-height:1.6;color:' . UBS_SEO_Admin_Brand::MUTED . ';max-width:68ch}'
            . '.wp-core-ui .ubs-seo-notice .ubs-seo-notice__title{margin:0 0 4px;font-size:16px;font-weight:600;color:' . UBS_SEO_Admin_Brand::INK . '}'
            . '.wp-core-ui .ubs-seo-notice .ubs-seo-notice__actions{margin-top:16px;display:flex;align-items:center;gap:28px}'
            . '.wp-core-ui .ubs-seo-notice .ubs-seo-notice__points{margin:12px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 28px;max-width:640px}'
            . '.wp-core-ui .ubs-seo-notice .ubs-seo-notice__points li{margin:0;display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.5;color:' . UBS_SEO_Admin_Brand::INK . '}'
            . '.wp-core-ui .ubs-seo-notice .ubs-seo-notice__points .dashicons{flex:none;color:' . UBS_SEO_Admin_Brand::PRIMARY . ';font-size:18px;width:18px;height:18px}'
            . '@media(max-width:782px){.wp-core-ui .ubs-seo-notice .ubs-seo-notice__points{grid-template-columns:1fr}}'
            . UBS_SEO_Admin_Brand::button_css( '.ubs-seo-notice' )
            . '.wp-core-ui .ubs-seo-notice .button-link{color:' . UBS_SEO_Admin_Brand::MUTED . '}'
            . '@media(max-width:600px){.wp-core-ui .ubs-seo-notice{flex-direction:column;gap:12px}}'
        );
    }

    public function render(): void {
        $nudge = self::nudge_to_show();
        if ( null === $nudge ) {
            return;
        }

        printf(
            // `notice` stays on the wrapper even though none of its paint
            // survives: core's common.js moves `div.notice` to sit after
            // `.wp-header-end`, and a panel without the class lands wherever the
            // hook fired — above the page title.
            '<div class="notice ubs-seo-notice">'
                . '<img src="%1$s" alt="" width="56" height="56">'
                . '<div><p class="ubs-seo-notice__title">%2$s</p><p>%3$s</p>%8$s'
                . '<p class="ubs-seo-notice__actions">'
                . '<a href="%4$s" class="button button-primary">%5$s</a>'
                . '<a href="%6$s" class="button-link">%7$s</a></p></div></div>',
            esc_url( UBS_SEO_URL . 'assets/icon.svg' ),
            esc_html( $nudge['title'] ),
            esc_html( $nudge['body'] ),
            esc_url( admin_url( 'admin.php?page=' . UBS_SEO_App_Page::PAGE_SLUG ) ),
            esc_html( $nudge['action'] ),
            esc_url( self::dismiss_url() ),
            esc_html__( 'Dismiss', 'ubersuggest-seo-tools' ),
            self::points_markup( $nudge['points'] )
        );
    }

    /**
     * Only the first-run panel lists what the plugin does. On the staleness
     * nudge the reader has already run an audit, so the same list stops being
     * an introduction and becomes an advert.
     *
     * @param string[] $points
     */
    private static function points_markup( array $points ): string {
        if ( [] === $points ) {
            return '';
        }

        $items = '';
        foreach ( $points as $point ) {
            $items .= sprintf(
                '<li><span class="dashicons dashicons-yes-alt" aria-hidden="true"></span>%s</li>',
                esc_html( $point )
            );
        }
        return '<ul class="ubs-seo-notice__points">' . $items . '</ul>';
    }

    /**
     * A nonce'd link rather than the `is-dismissible` close button: core's X is
     * pure JavaScript that forgets on reload, and persistence is the point. It
     * matches what core's own welcome panel does.
     */
    public function dismiss(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'Insufficient permissions.', 'ubersuggest-seo-tools' ) );
        }
        check_admin_referer( 'ubs_seo_dismiss_notice' );

        update_user_option( get_current_user_id(), self::USER_OPTION, time() );

        wp_safe_redirect( wp_get_referer() ?: admin_url() );
        exit;
    }

    /**
     * What this request should show, or null for nothing.
     *
     * One decision for both hooks: the stylesheet and the markup run separately
     * and a disagreement would paint an absent notice or leave a present one
     * unstyled. The screen test goes first because it rejects nearly every
     * admin request for the cost of a two-element in_array.
     *
     * @return array{title: string, body: string, points: string[], action: string}|null
     */
    private static function nudge_to_show(): ?array {
        $screen = get_current_screen();
        if ( ! $screen || ! in_array( $screen->id, self::SCREENS, true ) ) {
            return null;
        }
        if ( ! current_user_can( 'manage_options' ) || self::snoozed() ) {
            return null;
        }

        return self::nudge();
    }

    /**
     * The panel's copy, or null when a recent audit says the user is on top of
     * it. The two states are mutually exclusive, which is what keeps the plugin
     * from stacking two panels on one screen.
     *
     * The age comes from the same snapshot the dashboard widget renders, so the
     * two can never disagree about whether an analysis exists.
     *
     * @return array{title: string, body: string, points: string[], action: string}|null
     */
    private static function nudge(): ?array {
        $crawled_at_ms = UBS_SEO_Audit_Snapshot::crawled_at();

        // A disconnected site gets the introduction too, whatever it once
        // audited: "analyze again" would land on the connect gate, which cannot
        // run one, while the first-run panel leads exactly where it needs to.
        if ( $crawled_at_ms <= 0 || ! ( new UBS_SEO_OAuth_Client() )->is_connected() ) {
            return [
                'title'  => __( 'Analyze your site with Ubersuggest', 'ubersuggest-seo-tools' ),
                'body'   => __( 'See what is holding your SEO back, and fix it without leaving WordPress.', 'ubersuggest-seo-tools' ),
                'points' => [
                    __( 'Full site crawl and SEO score', 'ubersuggest-seo-tools' ),
                    __( 'Core Web Vitals and page speed', 'ubersuggest-seo-tools' ),
                    __( 'AI-written titles and meta descriptions', 'ubersuggest-seo-tools' ),
                    __( 'One-click fixes', 'ubersuggest-seo-tools' ),
                ],
                'action' => __( 'Analyze my site', 'ubersuggest-seo-tools' ),
            ];
        }

        $days = (int) floor( ( time() - (int) floor( $crawled_at_ms / 1000 ) ) / DAY_IN_SECONDS );
        if ( $days < self::STALE_DAYS ) {
            return null;
        }

        return [
            'title'  => sprintf(
                /* translators: %d: whole days since the site's last SEO analysis. */
                _n(
                    'Your SEO analysis is %d day old',
                    'Your SEO analysis is %d days old',
                    $days,
                    'ubersuggest-seo-tools'
                ),
                $days
            ),
            'body'   => __( 'A lot can change in a week. Run it again to see where your site stands today.', 'ubersuggest-seo-tools' ),
            'points' => [],
            'action' => __( 'Analyze again', 'ubersuggest-seo-tools' ),
        ];
    }

    private static function snoozed(): bool {
        $dismissed_at = (int) get_user_option( self::USER_OPTION, get_current_user_id() );
        return $dismissed_at > 0 && ( time() - $dismissed_at ) < self::STALE_DAYS * DAY_IN_SECONDS;
    }

    private static function dismiss_url(): string {
        return wp_nonce_url(
            admin_url( 'admin-post.php?action=ubs_seo_dismiss_notice' ),
            'ubs_seo_dismiss_notice'
        );
    }
}
