/**
 * Suggestion-generation poll budget: ~2.5 min per page.
 *
 * The backend worker does a cold start, a page crawl and an AI call, which
 * together run to 60–90s+, so a tighter budget would abandon pages that were
 * about to succeed.
 */
export const MAX_POLLS = 50;
export const POLL_INTERVAL_MS = 3000;

/**
 * Page re-crawl poll budget: ~5 min.
 *
 * A re-crawl waits on the crawler's task queue rather than the AI worker, so it
 * gets its own budget. The handful of URL variants it crawls is quick; the queue
 * wait is what dominates.
 */
export const MAX_RECRAWL_POLLS = 60;
export const RECRAWL_POLL_INTERVAL_MS = 5000;
