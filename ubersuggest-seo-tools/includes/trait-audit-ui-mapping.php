<?php
defined( 'ABSPATH' ) || exit;

/**
 * Mapping a crawl report into the shape the React Site Audit screen renders.
 */
trait UBS_SEO_Audit_Ui_Mapping {

    /** Map a `{done, report}` audit result into the React Site Audit screen shape. */
    public static function audit_to_ui( array $result, string $domain ): array {
        $report     = is_array( $result['report'] ?? null ) ? $result['report'] : [];
        $overview   = is_array( $report['overview'] ?? null ) ? $report['overview'] : [];
        $health     = is_array( $overview['health_check'] ?? null ) ? $overview['health_check'] : [];
        $categories = is_array( $report['issues_per_category'] ?? null ) ? $report['issues_per_category'] : [];

        // Mirror the Ubersuggest web app exactly: the dashboard shows the crawl's
        // domain-wide numbers, NOT what the plugin can fix locally. "Issues
        // Discovered" is the backend's own total; each issue keeps its raw crawl
        // count.
        $top_issues = [];
        foreach ( [ 'errors', 'warnings', 'recommendations' ] as $category ) {
            foreach ( ( $categories[ $category ]['issues'] ?? [] ) as $issue ) {
                $count = (int) ( $issue['count'] ?? 0 );
                if ( $count <= 0 ) {
                    continue;
                }
                // The ID is what the UI renders from: React translates it through
                // src/i18n/issue-text.ts, and `name` is only the fallback for an
                // issue that has no `issue_name_*` string.
                $issue_id     = (string) ( $issue['id'] ?? '' );
                $top_issues[] = [
                    'id'    => $issue_id,
                    'count' => $count,
                    'name'  => UBS_SEO_Issue_Labels::label( $issue_id ),
                ];
            }
        }
        usort( $top_issues, static fn( $left, $right ) => $right['count'] <=> $left['count'] );
        $top_issues = array_slice( $top_issues, 0, 3 );

        $total_issues = (int) ( $overview['total_issues_count'] ?? 0 );

        // The crawl's real completion time (epoch ms) — never "now": the plugin
        // must report the same last-crawl moment the Ubersuggest app shows.
        $last_crawled_ms = (int) ( $report['last_crawled'] ?? 0 );

        return [
            'domain'    => $domain,
            'lastCrawl' => $last_crawled_ms > 0
                ? wp_date( 'F j, Y g:i A', (int) floor( $last_crawled_ms / 1000 ) )
                : '',
            'overview'  => [
                // Organic traffic / keywords / backlinks are domain-level
                // metrics served by the separate /overview-metrics endpoint.
                'seoScore' => (int) ( $overview['overall_score'] ?? 0 ),
            ],
            'pagesCrawled' => (int) ( $overview['crawled'] ?? 0 ),
            'blocked'      => (int) ( $health['blocked'] ?? 0 ),
            'pageStatus'   => [
                'successful' => (int) ( $health['successful'] ?? 0 ),
                'redirected' => (int) ( $health['redirected'] ?? 0 ),
                'broken'     => (int) ( $health['broken'] ?? 0 ),
                'blocked'    => (int) ( $health['blocked'] ?? 0 ),
            ],
            'totalIssues' => $total_issues,
            'topIssues'   => $top_issues,
        ];
    }

}
