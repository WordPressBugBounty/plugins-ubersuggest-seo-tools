<?php
defined( 'ABSPATH' ) || exit;

/**
 * Mounts the React (@ubersuggest/ui) admin UI. The whole interface lives inside a
 * single same-origin iframe whose document is the Vite build output
 * (assets/app/index.html). Running the bundle *inside* the iframe realm keeps the
 * design-system's Tailwind preflight reset, :root tokens, and radix portals fully
 * isolated from wp-admin — no per-component wiring. Mirrors the architecture of
 * ubersuggest-wp-plugin-ds (see doc/ARCHITECTURE.md).
 *
 * The React app gets the data + actions it needs from the plugin's REST API
 * (UBS_SEO_Rest), authenticated with the wp_rest nonce we hand it below.
 */
class UBS_SEO_App_Page {

    /**
     * Public: the settings page links here, and it is NOT that page's slug.
     *
     * Menu page slugs live in a global admin namespace shared with every other
     * plugin, so this carries the full directory slug rather than the bare
     * brand — the WordPress.org review flagged plain 'ubersuggest' as a
     * collision risk.
     */
    public const PAGE_SLUG = 'ubersuggest-seo-tools';

    // Per-user transient carrying the connect success/error notice across the
    // post-callback redirect (the callback itself emits no HTML). The app reads
    // it once via the iframe config.
    private const OAUTH_NOTICE_TRANSIENT = 'ubs_seo_oauth_notice_';

    public function register(): void {
        add_action( 'admin_menu', [ $this, 'add_menu' ] );
        // Handle the OAuth redirect-back on admin_init (before any output) so
        // the code is consumed once and the URL redirected clean. If it ran
        // during render() instead, ?code & ?state would linger and re-fire the
        // callback on the next reload against an already-consumed PKCE
        // transient — surfacing a bogus "Invalid or expired" error.
        add_action( 'admin_init', [ $this, 'maybe_handle_oauth_callback' ] );
        add_action( 'admin_post_ubs_seo_oauth_connect', [ $this, 'handle_oauth_connect' ] );
    }

    /**
     * Step 1 of the OAuth flow: build the authorize URL and send the browser to
     * Ubersuggest. The app's Connect buttons all point here (nonce'd admin-post
     * URL served by the REST /connection payloads).
     */
    public function handle_oauth_connect(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'Insufficient permissions.', 'ubersuggest-seo-tools' ) );
        }
        check_admin_referer( 'ubs_seo_oauth_connect' );

        // wp_safe_redirect would send the user to wp-admin instead: the whole
        // point of this step is to leave the site for the Ubersuggest authorize
        // screen, an external host that allowed_redirect_hosts would reject.
        // The destination is built by us from UBS_SEO_DEFAULT_BASE_URL, never
        // from request input, and the capability + nonce were checked above.
        // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- Deliberate off-site redirect to the OAuth provider; URL is plugin-controlled.
        wp_redirect( ( new UBS_SEO_OAuth_Client() )->get_authorize_url() );
        exit;
    }

    /**
     * Step 2: Ubersuggest redirects back to THIS page with ?code & ?state —
     * exchange the code for tokens, stash the outcome for the app, and reload
     * the page clean. Runs on admin_init (before output) because the PKCE
     * verifier transient is single-use: leaving ?code & ?state in the URL would
     * re-run the exchange against a consumed transient on the next reload and
     * report a false "Invalid or expired" error.
     */
    public function maybe_handle_oauth_callback(): void {
        // No nonce is possible here, and none is the right check: this request
        // arrives as the OAuth provider's redirect, not as a submission of one
        // of our forms, so a wp_nonce would have no round trip to survive. The
        // CSRF guard is the `state` parameter, which handle_callback() matches
        // against a single-use transient bound to a PKCE verifier — and the
        // capability is checked before either value is read.
        // phpcs:disable WordPress.Security.NonceVerification.Recommended -- OAuth redirect-back; `state` + PKCE are the CSRF guard, validated in handle_callback().
        if ( ! isset( $_GET['page'] ) || self::PAGE_SLUG !== $_GET['page'] ) {
            return;
        }
        if ( ! isset( $_GET['code'], $_GET['state'] ) ) {
            return;
        }
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $code  = sanitize_text_field( wp_unslash( $_GET['code'] ) );
        $state = sanitize_text_field( wp_unslash( $_GET['state'] ) );
        // phpcs:enable WordPress.Security.NonceVerification.Recommended

        $result = ( new UBS_SEO_OAuth_Client() )->handle_callback( $code, $state );

        if ( $result === true ) {
            // First connection: provision the UBS project this site maps to, so
            // the AI fix endpoint (which is keyed to a project) is ready. No-ops
            // if the `projects` scope wasn't granted — generation then reports
            // it can't run until the account reconnects with the scope.
            UBS_SEO_Project::ensure_id();
            $notice = [ 'type' => 'success', 'message' => __( 'Connected to Ubersuggest.', 'ubersuggest-seo-tools' ) ];
        } else {
            $notice = [ 'type' => 'error', 'message' => $result->get_error_message() ];
        }

        set_transient( self::OAUTH_NOTICE_TRANSIENT . get_current_user_id(), $notice, MINUTE_IN_SECONDS );

        wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) );
        exit;
    }

    /**
     * Read and clear the connect notice stashed by the callback redirect.
     *
     * @return array{type:string,message:string}|null
     */
    private function take_oauth_notice(): ?array {
        $key    = self::OAUTH_NOTICE_TRANSIENT . get_current_user_id();
        $notice = get_transient( $key );
        if ( ! is_array( $notice ) ) {
            return null;
        }
        delete_transient( $key );
        return $notice;
    }

    public function add_menu(): void {
        // Pass the SVG as a base64 data URI (not a URL): WordPress only auto-sizes
        // menu icons to 20px when it detects the data:image/svg+xml;base64, prefix.
        $icon_file = UBS_SEO_PATH . 'assets/icon.svg';
        $icon      = file_exists( $icon_file )
            ? 'data:image/svg+xml;base64,' . base64_encode( (string) file_get_contents( $icon_file ) )
            : 'dashicons-chart-area';

        // No position argument: the menu appends after the core items, as the
        // WordPress.org review requires — plugins must not sit above or among
        // Posts/Media/Pages in the admin hierarchy.
        add_menu_page(
            __( 'Ubersuggest', 'ubersuggest-seo-tools' ),
            __( 'Ubersuggest', 'ubersuggest-seo-tools' ),
            'manage_options',
            self::PAGE_SLUG,
            [ $this, 'render' ],
            $icon
        );
    }

    public function render(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $entry = UBS_SEO_PATH . 'assets/app/index.html';
        if ( ! file_exists( $entry ) ) {
            printf(
                '<div class="wrap"><h1>%s</h1><p>%s</p><pre>pnpm install &amp;&amp; pnpm build</pre></div>',
                esc_html__( 'Ubersuggest', 'ubersuggest-seo-tools' ),
                esc_html__( 'UI bundle not built yet. Set PACKAGE_PAT_TOKEN, then run:', 'ubersuggest-seo-tools' )
            );
            return;
        }

        // Hand the React app (inside the iframe) the REST root + a nonce so it can
        // call our endpoints. Passed via the iframe URL fragment so it never hits
        // the server logs or browser history as a query param.
        $config = [
            'restUrl' => esc_url_raw( rest_url( UBS_SEO_Rest::NAMESPACE . '/' ) ),
            'nonce'   => wp_create_nonce( 'wp_rest' ),
            'lang'    => self::locale_language(),
            // Production app host, for deep links the UI builds itself.
            'appUrl'  => untrailingslashit( UBS_SEO_APP_URL ),
            // The attribution vocabulary for links the UI builds itself, so
            // React never repeats what {@see self::UTM_PARAMS} already owns.
            'utm'     => self::UTM_PARAMS,
        ];
        // Outcome of an OAuth connect that just landed back on this page —
        // read-once, so a reload doesn't re-announce it.
        $oauth_notice = $this->take_oauth_notice();
        if ( $oauth_notice !== null ) {
            $config['notice'] = $oauth_notice;
        }

        $frame = plugins_url( 'assets/app/index.html', UBS_SEO_PATH . 'ubersuggest-seo-tools.php' );
        $ver   = (string) filemtime( $entry );
        $src   = add_query_arg( 'v', $ver, $frame ) . '#' . rawurlencode( (string) wp_json_encode( $config ) );

        printf(
            '<div class="wrap"><iframe title="%1$s" src="%2$s" style="width:100%%;height:calc(100vh - 60px);border:0;display:block"></iframe></div>',
            esc_attr__( 'Ubersuggest', 'ubersuggest-seo-tools' ),
            esc_url( $src )
        );
    }

    /**
     * Map the admin's language to one of the design system's supported
     * languages (the same nine the Ubersuggest dashboard ships), defaulting to
     * English. The React app uses this for both the DS and our own strings.
     *
     * get_user_locale(), not get_locale(): wp-admin renders in the language on
     * the user's own profile, so reading the SITE language would show a
     * Portuguese admin an English screen on an English site — and send them to
     * an English pricing page from {@link self::app_url()}.
     */
    public static function locale_language(): string {
        $supported = [ 'en', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'ja', 'zh' ];
        $code      = strtolower( substr( (string) get_user_locale(), 0, 2 ) );
        return in_array( $code, $supported, true ) ? $code : 'en';
    }

    /**
     * The constant half of every outbound link's attribution — the part that
     * does not depend on which button was clicked.
     *
     * One definition for both halves of the app: PHP builds four of the five
     * links and React the fifth, and React receives these through the iframe
     * config rather than repeating them, so a rename cannot leave half the
     * links reporting under the old vocabulary.
     *
     * The values follow the web app's own house style for partner and
     * integration links (see its constants/apps.ts, which already describes
     * this plugin as a native integration); `utm_source` is the tracking
     * channel itself, so Mixpanel's `channel` and the stored attribution can
     * never name this origin differently.
     */
    public const UTM_PARAMS = [
        'utm_source'   => UBS_SEO_Tracking_Client::CHANNEL,
        'utm_medium'   => 'referral',
        'utm_campaign' => 'wordpress-plugin',
        'utm_term'     => 'native-integration',
    ];

    /**
     * A localized deep link into the Ubersuggest app, carrying the UTM params
     * the web app attributes the visit by — and whatever signup or purchase
     * follows it. The React half builds the same shape; see `appLink` in
     * src/api.ts.
     *
     * @param string $surface Where in the plugin the link was rendered; matches
     * the tracked event's `source` where one exists, so a funnel joins across
     * the boundary on one value.
     */
    public static function app_url( string $path, string $surface ): string {
        $params = self::UTM_PARAMS + [ 'utm_content' => $surface ];
        // rawurlencode because add_query_arg assigns values RAW (build_query
        // passes $urlencode = false) — the same trap UBS_SEO_OAuth_Client
        // documents. It does handle the '#fragment' itself, keeping it last.
        return add_query_arg(
            array_map( 'rawurlencode', $params ),
            untrailingslashit( UBS_SEO_APP_URL ) . '/' . self::locale_language() . $path
        );
    }
}
