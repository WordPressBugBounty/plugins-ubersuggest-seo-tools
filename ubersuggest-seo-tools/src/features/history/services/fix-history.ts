import { apiGet, apiPost } from '../../../api';
/** Not a refusal: the request never landed. Transient, so Undo stays. */
export type ClientRefusal = 'request_failed';

/** The fields a fix can write, matching UBS_SEO_Fix_History's `field` column. */
export type HistoryField =
  | 'title'
  | 'description'
  | 'h1'
  | 'home_title'
  | 'home_description';

/** Where the applied value came from; 'history' means a revert restored it. */
export type HistorySource = 'ai' | 'edited' | 'history';

/** One write this plugin made to one field of one page. */
export type HistoryRecord = {
  id: number;
  /** A revert is also a write, and gets its own record. */
  action: 'apply' | 'revert';
  issueId: string;
  /** Post id, or 'home' for the site-level homepage meta. */
  ref: string;
  field: HistoryField;
  /** Snapshot taken at write time — the record outlives the page. */
  pageTitle: string;
  pageUrl: string;
  /** False once the page is deleted: keep the row, drop the link. */
  pageExists: boolean;
  before: string;
  /** What came BACK for a revert, not the raw '' it wrote. */
  after: string;
  /** Does the undo write a value back, or clear the field? */
  restores: boolean;
  /** A later write replaced this value; the page no longer holds `after`. */
  stale: boolean;
  source: HistorySource;
  integration: string;
  /** WP display name, '' when that user has since been deleted. */
  user: string;
  appliedAt: string;
  /** The same instant as the site's wall clock, 'Y-m-d H:i:s'. */
  appliedAtSite: string;
  revertRefusal: RevertRefusal | null;
};

export type HistoryResponse = {
  records: HistoryRecord[];
  total: number;
  perPage: number;
  /** Issue ids the log holds — the type filter's options. */
  issueTypes: string[];
};

export type HistoryQuery = {
  issue?: string;
  ref?: string;
  search?: string;
  page?: number;
};

/** One page of the fix history, newest first. */
export function fetchHistory(query: HistoryQuery): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (query.issue) params.set('issue', query.issue);
  if (query.ref) params.set('ref', query.ref);
  if (query.search) params.set('search', query.search);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const suffix = params.toString();
  return apiGet<HistoryResponse>(`history${suffix ? `?${suffix}` : ''}`);
}

/**
 * Why the engine refused a revert (UBS_SEO_Fix_Revert::can_revert). Every code
 * `revert()` emits is listed, and the History tab keys each one.
 */
export type RevertRefusal =
  | 'superseded'
  | 'value_changed'
  | 'content_edited'
  | 'integration_changed'
  | 'post_deleted'
  | 'record_not_found'
  | 'revert_failed'
  | 'unsupported_record';

/**
 * A union on `ok`, mirroring the endpoint: a refusal ALWAYS carries its code
 * (trait-rest-fix-apply.php sends the engine's own), so a caller in the false
 * branch cannot be handed an absent one and does not need a fallback for it.
 */
export type RevertResponse =
  | { ok: true; revertRecordId: number; unlogged?: boolean }
  | { ok: false; code: RevertRefusal; error?: string };

/**
 * Undo one applied fix from its history record. The server refuses rather than
 * overwriting work it didn't do — the value moved on, the content was edited,
 * the integration changed, the post is gone.
 */
export function revertFix(revertId: number): Promise<RevertResponse> {
  return apiPost<RevertResponse>('history/revert', { id: revertId });
}
