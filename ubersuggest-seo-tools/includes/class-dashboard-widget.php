<?php
defined( 'ABSPATH' ) || exit;

/**
 * The site's SEO health as a native wp-admin dashboard widget.
 *
 * Registered through `wp_add_dashboard_widget`, so WordPress gives the user
 * drag, collapse and a Screen Options checkbox for free — a hand-placed panel
 * would take all three away. Everything renders from
 * {@see UBS_SEO_Audit_Snapshot}: the dashboard is the first screen of every
 * admin session, and no plugin has the right to put a round trip in front of it.
 */
class UBS_SEO_Dashboard_Widget {

    /** Movement colours; the rest of the palette is {@see UBS_SEO_Admin_Brand}. */
    private const GOOD = '#0a7c42';
    private const BAD  = '#ec003f';

    public function register(): void {
        add_action( 'wp_dashboard_setup', [ $this, 'add_widget' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_style' ] );
    }

    public function add_widget(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        // No position argument and no $wp_meta_boxes reordering: a plugin that
        // muscles its way to the top of someone else's dashboard is the habit
        // the WordPress.org review calls out, and Screen Options already lets
        // the user put this wherever they want it.
        wp_add_dashboard_widget(
            'ubs_seo_dashboard',
            /* translators: the product name. Left untranslated in every catalogue on purpose — an empty msgstr here is the brand, not a gap. */
            __( 'Ubersuggest SEO', 'ubersuggest-seo-tools' ),
            [ $this, 'render' ]
        );
    }

    public function enqueue_style(): void {
        $screen = get_current_screen();
        if ( ! $screen || 'dashboard' !== $screen->id || ! current_user_can( 'manage_options' ) ) {
            return;
        }

        wp_add_inline_style(
            'common',
            '.ubs-seo-widget__stats{display:flex;gap:28px;margin:0 0 16px}'
            . '.ubs-seo-widget__stat{display:flex;flex-direction:column;gap:2px}'
            . '.ubs-seo-widget__figure{display:flex;align-items:baseline;gap:6px;font-size:30px;'
            . 'font-weight:700;line-height:1;color:' . UBS_SEO_Admin_Brand::INK . '}'
            . '.ubs-seo-widget__delta{font-size:13px;font-weight:600;cursor:help}'
            . '.ubs-seo-widget__delta.is-up{color:' . self::GOOD . '}'
            . '.ubs-seo-widget__delta.is-down{color:' . self::BAD . '}'
            . '.ubs-seo-widget__delta.is-flat{color:' . UBS_SEO_Admin_Brand::MUTED . '}'
            . '.ubs-seo-widget__caption{font-size:12px;color:' . UBS_SEO_Admin_Brand::MUTED . '}'
            . '.ubs-seo-widget__issues{margin:0 0 16px;border-top:1px solid ' . UBS_SEO_Admin_Brand::LINE . '}'
            . '.ubs-seo-widget__issues li{display:flex;gap:10px;margin:0;padding:8px 0;'
            . 'border-bottom:1px solid ' . UBS_SEO_Admin_Brand::LINE . ';font-size:13px;color:' . UBS_SEO_Admin_Brand::INK . '}'
            . '.ubs-seo-widget__issues b{flex:none;min-width:28px;color:' . UBS_SEO_Admin_Brand::PRIMARY . '}'
            . '.ubs-seo-widget__meta{margin:0 0 16px;font-size:12px;color:' . UBS_SEO_Admin_Brand::MUTED . '}'
            . UBS_SEO_Admin_Brand::button_css( '.ubs-seo-widget' )
        );
    }

    public function render(): void {
        if ( ! ( new UBS_SEO_OAuth_Client() )->is_connected() ) {
            $this->render_empty(
                __( 'Connect your Ubersuggest account to see how this site is doing in search.', 'ubersuggest-seo-tools' ),
                __( 'Connect account', 'ubersuggest-seo-tools' )
            );
            return;
        }

        $audit = UBS_SEO_Audit_Snapshot::current();
        if ( null === $audit ) {
            $this->render_empty(
                __( 'No analysis yet. Run one to see your SEO score and what to fix.', 'ubersuggest-seo-tools' ),
                __( 'Analyze my site', 'ubersuggest-seo-tools' )
            );
            return;
        }

        echo '<div class="ubs-seo-widget">';
        $this->render_stats( $audit );
        $this->render_issues( $audit );
        $this->render_meta( $audit );
        $this->render_cta( __( 'Fix issues', 'ubersuggest-seo-tools' ) );
        echo '</div>';
    }

    /**
     * "Issues found", not "to fix": the number is the crawl's domain-wide total,
     * the same one the React screen labels "SEO Issues Discovered". What the
     * plugin can change locally is a subset of it, surfaced per issue on the
     * page the button opens.
     */
    private function render_stats( array $audit ): void {
        printf(
            '<div class="ubs-seo-widget__stats">'
                . '<div class="ubs-seo-widget__stat"><span class="ubs-seo-widget__figure">%1$s%2$s</span>'
                . '<span class="ubs-seo-widget__caption">%3$s</span></div>'
                . '<div class="ubs-seo-widget__stat"><span class="ubs-seo-widget__figure">%4$s</span>'
                . '<span class="ubs-seo-widget__caption">%5$s</span></div></div>',
            esc_html( (string) $audit['seoScore'] ),
            $this->delta_markup(),
            esc_html__( 'SEO score', 'ubersuggest-seo-tools' ),
            esc_html( (string) $audit['totalIssues'] ),
            esc_html__( 'Issues found', 'ubersuggest-seo-tools' )
        );
    }

    /**
     * The score's movement, empty before a second audit exists.
     *
     * A delta of zero is a real answer and says so; only a missing history is
     * silent. The interval it spans is whatever separates the last two audits
     * the plugin saw — a week for someone who polls weekly, a season for
     * someone who does not — so the previous audit's date rides along in the
     * tooltip rather than letting a bare number pass for a fixed period.
     */
    private function delta_markup(): string {
        $previous = UBS_SEO_Audit_Snapshot::previous();
        $delta    = UBS_SEO_Audit_Snapshot::score_delta();
        if ( null === $previous || null === $delta ) {
            return '';
        }

        $compared_with = sprintf(
            /* translators: %s: the previous analysis's date, YYYY-MM-DD. */
            __( 'Compared with the analysis of %s', 'ubersuggest-seo-tools' ),
            wp_date( 'Y-m-d', (int) floor( (int) $previous['crawledAt'] / 1000 ) )
        );

        if ( 0 === $delta ) {
            return sprintf(
                '<span class="ubs-seo-widget__delta is-flat" title="%1$s">%2$s</span>',
                esc_attr( $compared_with ),
                esc_html__( 'no change', 'ubersuggest-seo-tools' )
            );
        }

        return sprintf(
            '<span class="ubs-seo-widget__delta %1$s" title="%2$s">%3$s%4$d</span>',
            $delta > 0 ? 'is-up' : 'is-down',
            esc_attr( $compared_with ),
            $delta > 0 ? '&uarr;' : '&darr;',
            abs( $delta )
        );
    }

    /** Labels are resolved from the stored id here, never persisted — see the store. */
    private function render_issues( array $audit ): void {
        $issues = array_filter(
            (array) $audit['topIssues'],
            static fn( $issue ) => is_array( $issue ) && (int) ( $issue['count'] ?? 0 ) > 0
        );
        if ( [] === $issues ) {
            return;
        }

        echo '<ul class="ubs-seo-widget__issues">';
        foreach ( $issues as $issue ) {
            printf(
                '<li><b>%1$s</b> %2$s</li>',
                esc_html( (string) (int) $issue['count'] ),
                esc_html( UBS_SEO_Issue_Labels::label( (string) ( $issue['id'] ?? '' ) ) )
            );
        }
        echo '</ul>';
    }

    /**
     * Pages crawled, broken ones when there are any, and the crawl's age.
     *
     * The age is relative because that is the question a dashboard answers; the
     * exact moment, in the site's own timezone, rides along in the tooltip.
     */
    private function render_meta( array $audit ): void {
        $crawled_at = (int) floor( (int) $audit['crawledAt'] / 1000 );
        $broken     = (int) ( $audit['pageStatus']['broken'] ?? 0 );

        $parts = [
            sprintf(
                /* translators: %d: number of pages the crawl visited. */
                _n( '%d page crawled', '%d pages crawled', (int) $audit['pagesCrawled'], 'ubersuggest-seo-tools' ),
                (int) $audit['pagesCrawled']
            ),
        ];
        if ( $broken > 0 ) {
            $parts[] = sprintf(
                /* translators: %d: number of pages that failed to load during the crawl. */
                _n( '%d broken', '%d broken', $broken, 'ubersuggest-seo-tools' ),
                $broken
            );
        }
        /* translators: %s: a time span such as "2 days". Core's own string, reused deliberately (no text domain): human_time_diff() returns core's translation of the span, and core owns "%s ago" in every locale it ships — so the phrase stays whole even in a locale /languages does not cover. */
        // phpcs:ignore WordPress.WP.I18n.MissingArgDomain -- Deliberate reuse of a core string so the whole phrase is translated.
        $parts[] = sprintf( __( '%s ago' ), human_time_diff( $crawled_at ) );

        printf(
            '<p class="ubs-seo-widget__meta" title="%1$s">%2$s</p>',
            esc_attr( wp_date( 'F j, Y g:i A', $crawled_at ) ),
            esc_html( implode( ' · ', $parts ) )
        );
    }

    private function render_empty( string $message, string $action ): void {
        printf( '<div class="ubs-seo-widget"><p>%s</p>', esc_html( $message ) );
        $this->render_cta( $action );
        echo '</div>';
    }

    private function render_cta( string $label ): void {
        printf(
            '<a href="%1$s" class="button button-primary">%2$s</a>',
            esc_url( admin_url( 'admin.php?page=' . UBS_SEO_App_Page::PAGE_SLUG ) ),
            esc_html( $label )
        );
    }
}
