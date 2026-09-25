<?php
defined( 'ABSPATH' ) || exit;

/** Fix: shorten over-long titles (issue `title_long`). */
class UBS_SEO_Title_Length_Fix extends UBS_SEO_Title_Fix {

    public function issue_id(): string {
        return 'title_long';
    }

    protected function ok_message(): string {
        return __( 'All titles are within the recommended length.', 'ubersuggest-seo-tools' );
    }

    protected function fixable_message( int $count ): string {
        /* translators: %d: number of titles */
        return sprintf( _n( '%d title is too long.', '%d titles are too long.', $count, 'ubersuggest-seo-tools' ), $count );
    }

    protected function title_flagged( string $title ): bool {
        return mb_strlen( $title ) > UBS_SEO_Meta::TITLE_MAX;
    }
}
