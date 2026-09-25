<?php
defined( 'ABSPATH' ) || exit;

/**
 * The issues list: the crawl's active issues joined with each one's fix
 * capability, which is what decides the row's button.
 */
trait UBS_SEO_Rest_Issues {

    /**
     * The audit's active issues, each joined with fix metadata so the UI can show
     * a "Fix it" / "Review & fix" affordance. Fixes act on THIS WordPress site, so
     * they're meaningful when auditing the local site.
     */
    public function issues(): WP_REST_Response {
        $result = UBS_SEO_Audit_Service::fetch_audit( UBS_SEO_Audit_Service::audit_domain(), false );
        if ( is_wp_error( $result ) ) {
            return $this->error_response( $result );
        }
        if ( empty( $result['done'] ) ) {
            return new WP_REST_Response( [ 'pending' => true ], 200 );
        }

        $report     = is_array( $result['report'] ?? null ) ? $result['report'] : [];
        $categories = is_array( $report['issues_per_category'] ?? null ) ? $report['issues_per_category'] : [];

        $issues = [];
        foreach ( [ 'errors', 'warnings', 'recommendations' ] as $level ) {
            foreach ( ( $categories[ $level ]['issues'] ?? [] ) as $issue ) {
                $count = (int) ( $issue['count'] ?? 0 );
                if ( $count <= 0 ) {
                    continue;
                }
                $id = (string) ( $issue['id'] ?? '' );

                // Show the backend crawl's count, exactly like the Ubersuggest web
                // app's SEO Issues (seo_opportunities) — one row per issue with
                // count > 0, raw crawl number. How many of those pages THIS plugin
                // can actually change locally is surfaced in the fix preview, not
                // here, so the list matches the product one-to-one.
                $issues[] = [
                    'id'         => $id,
                    'label'      => UBS_SEO_Issue_Labels::label( $id ),
                    'count'      => $count,
                    'level'      => $level,
                    'seoImpact'  => (string) ( $issue['seo_impact'] ?? '' ),
                    'difficulty' => (string) ( $issue['difficulty'] ?? '' ),
                    'fix'        => $this->fix_meta( $id, $count ),
                ];
            }
        }

        // Issues we fixed keep a row even after the crawl stops flagging them
        // (count drops to 0 and the loop above skips them): append them as
        // resolved so they land in the UI's Fixed tab instead of vanishing.
        $listed = array_column( $issues, 'id' );
        foreach ( UBS_SEO_Fixes::applied_issue_ids() as $fixed_id ) {
            if ( in_array( $fixed_id, $listed, true ) ) {
                continue;
            }
            $meta = $this->fix_meta( $fixed_id );
            if ( ! $meta || $meta['state'] !== 'ok' ) {
                continue;
            }
            $issues[] = [
                'id'         => $fixed_id,
                'label'      => UBS_SEO_Issue_Labels::label( $fixed_id ),
                'count'      => 0,
                'level'      => 'warnings',
                'seoImpact'  => '',
                'difficulty' => '',
                'fix'        => $meta,
            ];
        }

        return new WP_REST_Response( [ 'issues' => $issues ] );
    }

    /**
     * Fix capability/state for an issue id, or null when no fix exists.
     *
     * $crawl_count is the affected-page count from the crawl REPORT. It guards
     * against the report and the per-issue BREAKDOWN (two separate backend
     * endpoints) disagreeing: when the report flags pages but the breakdown
     * comes back empty, status() would say 'ok' and the UI would file a
     * still-broken issue under Fixed. A crawl-flagged issue is never 'ok' —
     * at worst it's detected with nothing locally targetable ('manual').
     */
    private function fix_meta( string $issue_id, int $crawl_count = 0 ): ?array {
        $fix = UBS_SEO_Fixes::for_issue( $issue_id );
        if ( ! $fix ) {
            return null;
        }
        $status = $fix->status();
        if ( $crawl_count > 0 && ( $status['state'] ?? '' ) === 'ok' ) {
            $status = [
                'state'   => 'manual',
                'message' => __( 'Affected pages are listed in this issue.', 'ubersuggest-seo-tools' ),
            ];
        }
        // "Applied → Fixed tab (awaiting recrawl)" needs BOTH: the persistent
        // applied record AND a LIVE re-check that every flagged page is now
        // clean (targets_resolved). Gating on the live check — not the record
        // alone — means a PARTIAL apply keeps the remaining pages fixable, and
        // a re-flagged issue can't get stuck permanently in the Fixed tab.
        $applied = in_array( $issue_id, UBS_SEO_Fixes::applied_issue_ids(), true )
            && $fix instanceof UBS_SEO_AI_Content_Fix
            && $fix->targets_resolved();
        return [
            'state'       => (string) ( $status['state'] ?? '' ),
            'message'     => (string) ( $status['message'] ?? '' ),
            'previewable' => true,
            'applied'     => $applied,
        ];
    }

}
