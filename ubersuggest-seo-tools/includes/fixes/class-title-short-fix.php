<?php
defined( 'ABSPATH' ) || exit;

/** Fix: expand too-short titles (issue `title_short`). */
class UBS_SEO_Title_Short_Fix extends UBS_SEO_Title_Fix {

    public function issue_id(): string {
        return 'title_short';
    }

    protected function ok_message(): string {
        return __( 'No titles are too short.', 'ubersuggest-seo-tools' );
    }

    protected function fixable_message( int $count ): string {
        /* translators: %d: number of titles */
        return sprintf( _n( '%d title is too short.', '%d titles are too short.', $count, 'ubersuggest-seo-tools' ), $count );
    }

    protected function title_flagged( string $title ): bool {
        $length = mb_strlen( $title );
        // An EMPTY title is title_empty's issue, not this one's.
        return $length > 0 && $length < UBS_SEO_Meta::TITLE_MIN;
    }
}
