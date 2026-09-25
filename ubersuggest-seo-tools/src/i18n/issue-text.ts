import { translateDynamic } from './translate-dynamic';

/**
 * Display text for a Site Audit issue, translated here rather than taken from
 * the REST payload.
 *
 * The backend has no locale, and the PHP labels in class-issue-labels.php are
 * English `__()` strings the plugin ships no `.mo` files for — so anything that
 * renders `issue.label` / `issue.name` shows English whatever the site locale
 * is. ubersuggest-next has the same rule (site-audit/helpers/issue-display.ts):
 * the payload supplies the issue ID, the catalog supplies the words.
 *
 * Two forms, mirroring the app's `issue_name_*` / `siteAudit.<id>` pair:
 * - `issueName` — the issue standing on its own ("No H1 tag").
 * - `issueDescription` — a fragment written to trail a count ("without a H1
 *   heading"), as the issues table and its drawer read it.
 *
 * The server string stays as the fallback: an issue ID we have no translation
 * for still reads as words instead of a leaked catalog key.
 */
function localizedIssueText(key: string, serverText: string): string {
  const translated = translateDynamic(key);
  return translated === key ? serverText : translated;
}

/** The issue's own name, e.g. "No meta description". */
export function issueName(issueId: string, serverText = ''): string {
  return localizedIssueText(`issue_name_${issueId}`, serverText);
}

/** The issue as a fragment trailing a count, e.g. "with no meta description". */
export function issueDescription(issueId: string, serverText = ''): string {
  return localizedIssueText(`issue_desc_${issueId}`, serverText);
}
