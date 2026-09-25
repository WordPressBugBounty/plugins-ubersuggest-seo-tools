<?php
defined( 'ABSPATH' ) || exit;

/** Fix: supply a title where the page has none (issue `title_empty`). */
class UBS_SEO_Title_Empty_Fix extends UBS_SEO_Title_Fix {

    public function issue_id(): string {
        return 'title_empty';
    }

    protected function ok_message(): string {
        return __( 'Every page has a title.', 'ubersuggest-seo-tools' );
    }

    protected function fixable_message( int $count ): string {
        /* translators: %d: number of pages */
        return sprintf( _n( '%d page has no title.', '%d pages have no title.', $count, 'ubersuggest-seo-tools' ), $count );
    }

    protected function title_flagged( string $title ): bool {
        return $title === '';
    }
}
