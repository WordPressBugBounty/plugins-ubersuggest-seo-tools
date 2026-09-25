import { apiGet, apiPost } from '../../../api';
import type { NotConnectedFields } from '../../../ui/connect-account-card';
import type { Credits, PreviewRow, ProjectCta, RecrawlVerdict } from '../types';

/**
 * What the preview endpoints answer. `NotConnectedFields` means the account
 * died mid-session and the endpoint sent that instead of rows.
 */
export type PreviewResponse = NotConnectedFields & {
  rows?: PreviewRow[];
  pending?: boolean;
  credits?: Credits;
  error?: string;
  freePlan?: boolean;
  /** No UBS project for this site and none could be created — AI can't run. */
  projectRequired?: ProjectCta;
};

/**
 * What `/page-recrawl` answers, in either of its two modes (start and poll).
 *
 * `pending` and `verdict` are mutually exclusive: the crawl is either still
 * running or it has settled on an outcome. A settled response with no `verdict`
 * therefore means the endpoint could not reach one at all, which the caller must
 * leave as "no answer" rather than read as a passing page.
 */
export type RecrawlResponse = NotConnectedFields & {
  pending?: boolean;
  crawlCount?: number;
  verdict?: RecrawlVerdict;
  error?: string;
};

export type PreviewEndpoint = 'fix/preview' | 'issue-pages';

/**
 * Manual issues share the whole generate/poll flow, just against the
 * issue-pages endpoint (rows keyed by crawl URL instead of post id).
 */
export const previewEndpoint = (manualMode: boolean): PreviewEndpoint =>
  manualMode ? 'issue-pages' : 'fix/preview';

/** List, kick off, or poll one issue's fixable pages. */
export function fetchPreview(
  endpoint: PreviewEndpoint,
  issueId: string,
  query: string,
): Promise<PreviewResponse> {
  return apiGet<PreviewResponse>(
    `${endpoint}?issue=${encodeURIComponent(issueId)}${query}`,
  );
}

/** Re-crawl one fixed page to confirm the crawl agrees the issue is gone. */
export function fetchPageRecrawl(
  issueId: string,
  ref: string,
  query: string,
): Promise<RecrawlResponse> {
  return apiGet<RecrawlResponse>(
    `page-recrawl?issue=${encodeURIComponent(issueId)}&ref=${encodeURIComponent(ref)}${query}`,
  );
}

export type ApplyResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  appliedRefs?: string[];
  /**
   * Per-ref Undo data for the pages this apply wrote (history record id + the
   * value an Undo would restore) — lets the green card offer Undo immediately,
   * without waiting for a drawer reopen to re-list the page.
   */
  revertOffers?: Record<string, { id: number; to: string }>;
  shouldAskForReview?: boolean;
};

/**
 * Write the reviewed suggestions, keyed by page ref, so the backend writes
 * exactly what the user saw (no re-charge).
 *
 * @param sources whether each value is the raw AI suggestion or was edited by
 * the user — recorded in the fix history, so an audit can tell the two apart.
 */
export function applyFixes(
  issueId: string,
  values: Record<string, string | null>,
  sources: Record<string, string>,
): Promise<ApplyResponse> {
  return apiPost<ApplyResponse>('fix/apply', {
    issue: issueId,
    values,
    sources,
  });
}
