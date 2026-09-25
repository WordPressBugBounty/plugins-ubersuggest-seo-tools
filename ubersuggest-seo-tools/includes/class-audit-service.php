<?php
defined( 'ABSPATH' ) || exit;

/**
 * Audit data layer: resolves the target domain and fetches / maps / breaks down
 * Site Audit data from the backend (or the local mock). The REST controller
 * delegates here so it stays thin (routing + response shaping) — the same
 * handler → model separation the Ubersuggest backend uses.
 *
 * Assembled from one trait per concern, each in its own file. Every method stays
 * a static of THIS class, so no caller changes.
 */
class UBS_SEO_Audit_Service {

    use UBS_SEO_Audit_Fetch;
    use UBS_SEO_Audit_Breakdown;
    use UBS_SEO_Audit_Page_Map;
    use UBS_SEO_Audit_Urls;
    use UBS_SEO_Audit_Post_Resolver;
    use UBS_SEO_Audit_Recrawl;
    use UBS_SEO_Audit_Verdict;
    use UBS_SEO_Audit_Ui_Mapping;
}
