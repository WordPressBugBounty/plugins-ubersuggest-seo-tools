// Shapes returned by the plugin REST API for the SEO Issues screen.

export type FixMeta = {
  state: string; // 'ok' | 'fixable' | 'manual'
  message: string;
  previewable: boolean;
  // The user applied this fix; the crawl re-verifies only on its next run, so
  // the row sits in the Fixed tab as "awaiting recrawl" until then.
  applied?: boolean;
};

export type Issue = {
  id: string;
  label: string;
  count: number;
  level: string; // 'errors' | 'warnings' | 'recommendations'
  seoImpact: string;
  difficulty: string;
  fix: FixMeta | null;
};

export type PreviewRow = {
  ref: string; // post id (fixable issues) or crawl URL (manual issues)
  label: string;
  url?: string; // permalink of the page, for the "open in new tab" link
  before: string;
  after: string | null;
  // 'fallback' = generation settled with no suggestion; the card offers Try again.
  status: string; // 'idle' | 'ready' | 'pending' | 'fallback' | 'limit' | 'fixed' | 'info'
  source: string | null; // 'ai' | 'edited'
  // False on crawl-flagged pages with no editable post behind them (custom
  // routes, archives): the suggestion is copy-only. Absent means applyable.
  applyable?: boolean;
  // Fixed rows only, when the field still holds exactly what the plugin wrote:
  // the history record an Undo would revert, and the value that would return.
  revertId?: number;
  revertTo?: string;
  // `page_allowed` only: WHY the crawl found this page blocked, as the backend's
  // own token ('robots_txt', 'meta_tag', 'http_header', 'attribute',
  // 'too_many_redirects'). Each needs a different remedy, so it's the one piece
  // of actionable detail on an issue with no Apply.
  blockedReason?: string | null;
};

/**
 * Outcome of re-crawling one fixed page. Two of the four are non-answers, and
 * both are deliberate — showing either as "fixed" would confirm the fix on no
 * evidence:
 * - 'too_soon': the backend declined to crawl (the page was crawled under a
 *   minute ago, or the account can't re-crawl on demand) and served the previous
 *   report. Temporary and retryable, which is why it isn't folded into 'unknown'.
 * - 'unknown': the crawl ran but its breakdown couldn't be read.
 */
export type RecrawlVerdict = 'fixed' | 'still_flagged' | 'too_soon' | 'unknown';

// Sent instead of a suggestion when no UBS project exists for this site and one
// couldn't be created (usually the plan's project limit) — AI can't run at all,
// so the drawer shows a CTA: add the project, or upgrade.
export type ProjectCta = {
  domain: string;
  manageProjectsUrl: string;
  upgradeUrl: string;
};

// Fix-suggestion credit balance, returned by /fix/preview so the UI can gate the
// per-page Generate buttons before any chargeable generation fires.
export type Credits = {
  used: number;
  limit: number;
  remaining: number;
  cost: number;
};
