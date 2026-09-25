<?php
defined( 'ABSPATH' ) || exit;

/**
 * The backend's per-issue breakdown: which URLs the crawl flagged, and the
 * per-page attachments that say WHY.
 */
trait UBS_SEO_Audit_Breakdown {

    /**
     * Distinct page URLs the audit flagged for an issue (the SEO Issues Details
     * data). Works for any issue type.
     *
     * Returns NULL when the breakdown could not be fetched (transport error or
     * non-200 — expired token, backend 5xx, timeout), so callers can tell a
     * failure apart from a genuinely empty breakdown and never treat "couldn't
     * load" as "no affected pages / issue resolved". An empty array means the
     * backend answered with no flagged pages.
     *
     * @return string[]|null
     */
    public static function breakdown_urls( string $issue_id ): ?array {
        $items = self::breakdown_items( $issue_id );
        if ( $items === null ) {
            return null;
        }
        return array_values( array_map(
            static fn( array $item ): string => (string) $item['url'],
            $items
        ) );
    }

    /**
     * The breakdown as full items: the resolved page URL plus the per-page
     * `attachments` the backend sends alongside it (e.g. page_blocked_reason for
     * `page_allowed`, the measured title for the title issues). The attachments
     * are the only place the crawl says WHY a page was flagged, so an issue with
     * no local fix still has something to show.
     *
     * @return array<int, array{url: string, attachments: array<string,mixed>}>|null
     */
    public static function breakdown_items( string $issue_id ): ?array {
        // Mock mode audits THIS site, so the backend has no breakdown for it —
        // derive the affected pages locally instead.
        if ( self::mock_enabled() ) {
            return UBS_SEO_Local_Audit::breakdown_items( $issue_id );
        }
        $response = ( new UBS_SEO_Api_Client() )->get_site_audit_breakdown( self::audit_domain(), $issue_id );
        if ( is_wp_error( $response ) || (int) ( $response['status'] ?? 0 ) !== 200 ) {
            return null;
        }
        // Body shape: { result: { breakdown: [...], ignored?: [...] } }, or
        // { result: { noData: true } } when no breakdown is stored for this
        // domain+issue+tier.
        $body   = is_array( $response['body'] ?? null ) ? $response['body'] : [];
        $result = is_array( $body['result'] ?? null ) ? $body['result'] : $body;

        // noData is NOT "zero affected pages": the backend has no breakdown to
        // give (never built, or its TTL expired) while the report still counts
        // the issue. Reading it as an empty list made status() report 'ok' — the
        // issue confirmed as fixed, its Fix button gone — and cached that for
        // five minutes. Treat it as the fetch failure it is.
        if ( ! empty( $result['noData'] ) ) {
            return null;
        }

        $breakdown = $result['breakdown'] ?? null;
        if ( ! is_array( $breakdown ) ) {
            return [];
        }
        // Pages the user ignored for this issue in the Ubersuggest dashboard are
        // moved OUT of `breakdown` into `ignored`. The report's issue count still
        // includes them, so dropping them here is the same contradiction as
        // above: "1 page affected" over an empty list. Keep them listed — the
        // crawl did flag them.
        if ( is_array( $result['ignored'] ?? null ) ) {
            $breakdown = array_merge( $breakdown, $result['ignored'] );
        }

        $items = [];
        $seen  = [];
        foreach ( $breakdown as $item ) {
            if ( ! is_array( $item ) ) {
                continue;
            }
            $url = self::breakdown_item_url( $item );
            if ( $url === '' ) {
                continue;
            }
            $key = self::normalize_url( $url );
            if ( isset( $seen[ $key ] ) ) {
                continue;
            }
            $seen[ $key ] = true;
            $items[]      = [
                'url'         => $url,
                'attachments' => is_array( $item['attachments'] ?? null ) ? $item['attachments'] : [],
            ];
        }
        return $items;
    }

    /**
     * A breakdown item's page URL.
     *
     * Items carry an absolute `url` in practice — the backend's own handler
     * indexes `item["url"]` unconditionally, so a missing key would raise there
     * first. The `path` branch mirrors the dashboard's resolveItemUrl as cheap
     * insurance for a shape we haven't seen, and an item with neither is skipped.
     */
    private static function breakdown_item_url( array $item ): string {
        $url = trim( (string) ( $item['url'] ?? '' ) );
        if ( $url !== '' ) {
            return $url;
        }
        if ( ! array_key_exists( 'path', $item ) ) {
            return '';
        }
        // '' is the domain root, which is a real page — only a missing key means
        // "nothing to resolve".
        return self::local_url_for_path( trim( (string) $item['path'] ) );
    }

}
