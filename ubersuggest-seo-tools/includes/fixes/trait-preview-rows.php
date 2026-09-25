<?php
defined( 'ABSPATH' ) || exit;

/**
 * Building the preview's rows: one card per affected page, each carrying a
 * status the UI polls on. Covers the three kinds of target — editable posts,
 * the site-level homepage, and crawl-flagged URLs with no post behind them.
 */
trait UBS_SEO_Fix_Preview_Rows {

    /**
     * Non-blocking preview: one row per affected page, each carrying a status
     * ('ready' | 'pending' | 'fallback') so the UI can poll while AI generates
     * instead of the request blocking (and timing out) on a many-page site.
     *
     * @param string $mode 'list' | 'generate' | 'status' — see UBS_SEO_Suggestions::for_post_async.
     * @return array<int,array{ref:string,label:string,before:string,after:?string,status:string,source:?string}>
     */
    public function preview_async( string $mode = 'list', string $ref = '' ): array {
        // On the list step, read every already-generated suggestion in one backend
        // call so reopening the drawer restores them (server-side cache), instead
        // of a per-page call inside the loop.
        $cached = ( $mode === 'list' ) ? UBS_SEO_Suggestions::cached_map( $this->issue_id() ) : [];

        $rows = [];
        foreach ( $this->target_ids() as $id ) {
            // With a ref, generate/poll only that page, so one click can't charge
            // for every page at once.
            if ( $ref !== '' && (string) $id !== $ref ) {
                continue;
            }
            $post = get_post( $id );
            if ( ! $post instanceof WP_Post ) {
                continue;
            }
            $before = $this->before_value( $post );
            // No longer broken locally (applied here, or fixed by hand): a done
            // card. The crawl keeps flagging the page until its next full run,
            // so without this the fix would come back as a fresh suggestion on
            // every reopen. The card only leaves when the crawl stops listing it.
            if ( ! $this->still_broken( $post ) ) {
                $row = [
                    'ref'    => (string) $id,
                    'label'  => get_the_title( $id ),
                    'url'    => (string) get_permalink( $id ),
                    'before' => $before !== '' ? $before : __( '(none)', 'ubersuggest-seo-tools' ),
                    'after'  => $this->live_value( $post ),
                    'status' => 'fixed',
                    'source' => null,
                ];
                $offer = $this->revert_offer( (string) $id );
                if ( $offer !== null ) {
                    $row['revertId'] = $offer['id'];
                    $row['revertTo'] = $offer['to'];
                }
                $rows[] = $row;
                continue;
            }
            $result = UBS_SEO_Suggestions::for_post_async( $this->issue_id(), $post, $mode, $cached );
            $rows[] = [
                'ref'    => (string) $id,
                'label'  => get_the_title( $id ),
                'url'    => (string) get_permalink( $id ),
                'before' => $before !== '' ? $before : __( '(none)', 'ubersuggest-seo-tools' ),
                'after'  => $result['suggestion'] ?? null,
                'status' => $result['status'],
                'source' => $result['source'] ?? null,
                'debug'  => $result['debug'] ?? null,
            ];
        }

        // The homepage, when the crawl flagged it and this fix can write the
        // site-level meta: same generate/poll protocol keyed by URL, but APPLY
        // works — it writes the home title/description setting instead of post
        // meta. Ref is the 'home' sentinel, since there's no post id.
        $home_url = $this->home_target();
        if ( $home_url !== '' && ( $ref === '' || $ref === self::HOME_REF || $ref === $home_url ) ) {
            $before = $this->home_before_value();
            $row    = [
                'ref'    => self::HOME_REF,
                'label'  => get_bloginfo( 'name' ) !== ''
                    /* translators: %s: this site's name. Labels the front page in the fix list. */
                    ? sprintf( __( '%s — homepage', 'ubersuggest-seo-tools' ), get_bloginfo( 'name' ) )
                    : __( 'Homepage', 'ubersuggest-seo-tools' ),
                'url'    => $home_url,
                'before' => $before !== '' ? $before : __( '(none)', 'ubersuggest-seo-tools' ),
                'after'  => null,
                'status' => 'idle',
                'source' => null,
            ];
            if ( ! $this->home_still_broken() ) {
                $row['after']  = $before;
                $row['status'] = 'fixed';
                $offer         = $this->revert_offer( self::HOME_REF );
                if ( $offer !== null ) {
                    $row['revertId'] = $offer['id'];
                    $row['revertTo'] = $offer['to'];
                }
            } elseif ( $mode === 'list' ) {
                $cached_key = UBS_SEO_Audit_Service::normalize_url( $home_url );
                if ( isset( $cached[ $cached_key ] ) && $cached[ $cached_key ] !== '' ) {
                    $row['after']  = $cached[ $cached_key ];
                    $row['status'] = 'ready';
                    $row['source'] = 'ai';
                }
            } else {
                $result        = UBS_SEO_Suggestions::for_url_async( $this->issue_id(), $home_url, $mode );
                $row['after']  = $result['suggestion'] ?? null;
                $row['status'] = $result['status'];
                $row['source'] = ( $result['status'] === 'ready' ) ? 'ai' : null;
                $row['debug']  = $result['debug'] ?? null;
            }
            $rows[] = $row;
        }

        // Crawl-flagged URLs with no editable post behind them (custom routes,
        // archives): same card and generate/poll protocol, keyed by URL, but
        // nothing to apply — the user copies the suggestion to wherever that
        // page is managed. Keeps the drawer 1:1 with the app's affected pages.
        foreach ( $this->unmapped_urls() as $url ) {
            if ( $ref !== '' && $url !== $ref ) {
                continue;
            }
            $label = (string) wp_parse_url( $url, PHP_URL_PATH );
            $row   = [
                'ref'       => $url,
                'label'     => $label !== '' ? $label : $url,
                'url'       => $url,
                'before'    => __( '(none)', 'ubersuggest-seo-tools' ),
                'after'     => null,
                'status'    => 'idle',
                'source'    => null,
                'applyable' => false,
            ];
            if ( $mode === 'list' ) {
                $cached_key = UBS_SEO_Audit_Service::normalize_url( $url );
                if ( isset( $cached[ $cached_key ] ) && $cached[ $cached_key ] !== '' ) {
                    $row['after']  = $cached[ $cached_key ];
                    $row['status'] = 'ready';
                    $row['source'] = 'ai';
                }
            } else {
                $result        = UBS_SEO_Suggestions::for_url_async( $this->issue_id(), $url, $mode );
                $row['after']  = $result['suggestion'] ?? null;
                $row['status'] = $result['status'];
                $row['source'] = ( $result['status'] === 'ready' ) ? 'ai' : null;
                $row['debug']  = $result['debug'] ?? null;
            }
            $rows[] = $row;
        }
        return $rows;
    }

}
