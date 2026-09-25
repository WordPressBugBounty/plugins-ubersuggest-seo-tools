/**
 * Blog articles some explainer texts link to, keyed `<issue>_<what|how>` — the
 * same map ubersuggest-next keeps in site-audit/helpers/issue-display.
 *
 * The texts that have a link carry a `{0}` placeholder where it goes (e.g.
 * "check out {0} in-depth guide"), so a missing entry silently leaves the
 * placeholder unfilled. `issueArticleUrls` returning [] for everything else is
 * the normal case, not an error.
 */
const ISSUE_ARTICLE_URLS: Record<string, string[]> = {
  seo_friendly_url_relative_length_check_what: [
    'https://neilpatel.com/blog/seo-urls',
  ],
  seo_non_friendly_url_what: ['https://neilpatel.com/blog/seo-urls'],
  title_short_what: ['https://neilpatel.com/blog/title-tags-seo/'],
  have_title_duplicates_how: ['https://neilpatel.com/blog/title-tags-seo/'],
  title_duplicate_tag_how: ['https://neilpatel.com/blog/title-tags-seo/'],
  title_empty_how: ['https://neilpatel.com/blog/title-tags-seo/'],
  title_long_what: ['https://neilpatel.com/blog/title-tags-seo/'],
  ssl_certificate_valid_how: [
    'https://medium.freecodecamp.org/how-to-get-https-working-on-your-local-development-environment-in-5-minutes-7af615770eec',
  ],
  compression_disabled_how: [
    'https://neilpatel.com/blog/optimize-images-web-design/',
  ],
  have_sitemap_how: ['https://neilpatel.com/blog/xml-sitemap/'],
  duplicate_meta_descriptions_how: [
    'https://neilpatel.com/blog/how-to-write-meta-descriptions',
  ],
  duplicate_meta_description_tags_how: [
    'https://neilpatel.com/blog/how-to-write-meta-descriptions',
  ],
  meta_description_empty_how: [
    'https://neilpatel.com/blog/how-to-write-meta-descriptions/',
  ],
  absent_encoding_meta_tag_how: [
    'https://www.w3.org/International/questions/qa-headers-charset',
    'https://www.w3.org/International/tutorials/tutorial-char-enc',
  ],
};

export function issueArticleUrls(
  issueId: string,
  type: 'what' | 'how',
): string[] {
  return ISSUE_ARTICLE_URLS[`${issueId}_${type}`] ?? [];
}
