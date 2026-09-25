import { translate } from '@ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiGet, apiPost } from '../../../api';
import {
  type ConnectPrompt,
  connectPromptFrom,
  type NotConnectedFields,
} from '../../../ui/connect-account-card';
import type { Audit } from '../types';

// A crawl runs async on the backend; large sites can take many minutes. We poll
// status (poll=1 never re-triggers) with a gentle backoff so a long crawl isn't
// hammered, and only give up after a generous backstop rather than a short cap.
const SLOW_AFTER_POLLS = 12; // ~2 min in: reassure the user it's a big crawl
const MAX_POLLS = 120; // runaway backstop (~35 min with the backoff below)
// A single blip over a ~35-min poll loop must not declare the crawl failed —
// the backend keeps crawling regardless; retry a few times first.
const MAX_CONSECUTIVE_FAILURES = 3;
const pollInterval = (attempt: number) =>
  Math.min(20000, 4000 + attempt * 1000);

// Only the count — the crawler (DFS) keeps discovering pages mid-crawl, so a
// "max" would climb and read as a shrinking/erratic total. We just show the
// pages-crawled number going up.
type Progress = { count: number };

/**
 * What the three crawl endpoints answer with. They share a shape on purpose:
 * cancelling reads the report back server-side and returns it here, so one
 * handler covers every reply.
 *
 * @property noReport Cancel only, and only on a site whose first crawl this
 * was: there is no stored report to fall back to.
 * @property reportUnavailable Cancel only: the crawl stopped, but the fallback
 * read failed — a report may exist, we just couldn't fetch it. Both flags reach
 * the page as `noReport`, and land on the cancelled screen unless a report is
 * already in state; what must never happen is `{error}`, which reads as the
 * CANCEL failing.
 * @property stopFailed Cancel only: the stop failed and the crawl is still
 * running. Arrives as a code (HTTP 200), never through `error` — the error
 * screen replaces the progress view, which must survive a failed stop.
 */
type AuditResponse = Audit &
  NotConnectedFields & {
    error?: string;
    pending?: boolean;
    crawlCount?: number;
    noReport?: boolean;
    reportUnavailable?: boolean;
    stopFailed?: boolean;
  };

/**
 * How a call enters the crawl lifecycle: start a crawl, read one, or stop one.
 * `poll` is also what the loop schedules itself with.
 */
type RunMode = 'trigger' | 'poll' | 'cancel';

/**
 * Owns fetching the audit + the recrawl/cancel/poll lifecycle. The page consumes
 * the returned state; presentation lives entirely in the cards.
 *
 * @returns `connectPrompt` non-null means the site has no usable Ubersuggest
 * account — the page shows the Connect screen instead of `audit` or `error`.
 * `noReport` means the cancel found nothing on the backend to fall back to —
 * the page still prefers a report it already holds.
 */
export function useSiteAudit() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set only when the backend reports no usable account, so the page can offer
  // the Connect (or Reconnect) screen instead of a load error.
  const [connectPrompt, setConnectPrompt] = useState<ConnectPrompt | null>(
    null,
  );
  const [reloading, setReloading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [noReport, setNoReport] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [takingLong, setTakingLong] = useState(false);
  const timer = useRef<number | null>(null);
  const polls = useRef(0);
  const consecutiveFailures = useRef(0);
  // Which chain of requests is the live one. Clearing the armed timeout kills
  // only the scheduled half of a poll chain — a request already in flight
  // still lands, and its handler would re-arm the loop. Bumping this orphans
  // that response instead: handlers compare their captured value and discard.
  const generation = useRef(0);

  const fail = useCallback((message: string) => {
    setError(message);
    setProgress(null);
    setTakingLong(false);
    setReloading(false);
    setCancelling(false);
  }, []);

  const run = useCallback(
    (mode: RunMode) => {
      if (mode !== 'cancel') setReloading(true);
      setError(null);
      setConnectPrompt(null);
      setNoReport(false);
      if (mode !== 'poll') {
        setCancelFailed(false);
        // Starting or stopping a crawl mid-crawl must kill the old poll chain
        // in both of its forms: the armed timeout (cleared here) and a request
        // already in flight (orphaned by the generation bump). Either survivor
        // keeps the old chain running in parallel — and a poll that outlives a
        // cancel re-arms the loop, whose next poll=1 on a site with no stored
        // report RELAUNCHES the crawl the user just cancelled.
        generation.current += 1;
        if (timer.current) window.clearTimeout(timer.current);
      }
      if (mode === 'trigger') {
        polls.current = 0;
        consecutiveFailures.current = 0;
        setTakingLong(false);
      }
      // Which chain this request belongs to; compared before handling the
      // response, so a reply from a superseded chain changes nothing.
      const chain = generation.current;
      if (mode === 'cancel') setCancelling(true);

      // The crawl is still running, so the error screen would be a lie — say
      // the stop failed and go back to following the crawl. Both ways a cancel
      // fails land here: the backend saying so ({stopFailed}) and the POST
      // itself failing in transit.
      const stopFailed = () => {
        setCancelling(false);
        setCancelFailed(true);
        timer.current = window.setTimeout(() => run('poll'), pollInterval(0));
      };

      const request =
        mode === 'cancel'
          ? // The route stops the crawl AND reads the report back, in one call:
            // a cancel followed by a separate poll would race, because that
            // poll starts a crawl when nothing is stored yet.
            apiPost<AuditResponse>('audit/cancel', {})
          : apiGet<AuditResponse>(
              mode === 'trigger' ? 'audit' : 'audit?poll=1',
            );

      request
        .then((data) => {
          if (generation.current !== chain) return;
          consecutiveFailures.current = 0;
          setCancelling(false);
          const prompt = connectPromptFrom(data);
          if (prompt) {
            setConnectPrompt(prompt);
            setProgress(null);
            setTakingLong(false);
            setReloading(false);
            return;
          }
          if (data.stopFailed) {
            stopFailed();
            return;
          }
          if (data.error) {
            fail(data.error);
            return;
          }
          if (data.noReport || data.reportUnavailable) {
            setProgress(null);
            setTakingLong(false);
            setReloading(false);
            setNoReport(true);
            return;
          }
          if (data.pending) {
            setProgress({ count: data.crawlCount ?? 0 });
            if (polls.current >= SLOW_AFTER_POLLS) setTakingLong(true);
            if (polls.current >= MAX_POLLS) {
              fail(translate('crawl_taking_long'));
              return;
            }
            const attempt = polls.current;
            polls.current += 1;
            timer.current = window.setTimeout(
              () => run('poll'),
              pollInterval(attempt),
            );
            return;
          }
          setAudit(data);
          setProgress(null);
          setTakingLong(false);
          setReloading(false);
        })
        .catch((err) => {
          if (generation.current !== chain) return;
          if (mode === 'cancel') {
            stopFailed();
            return;
          }
          // Mid-crawl, a transient fetch failure (network blip, session hiccup)
          // just retries the poll — the server-side crawl is unaffected. Only
          // repeated failures (or a failure outside a crawl) become an error.
          const midCrawl = polls.current > 0;
          consecutiveFailures.current += 1;
          if (
            midCrawl &&
            consecutiveFailures.current <= MAX_CONSECUTIVE_FAILURES
          ) {
            timer.current = window.setTimeout(
              () => run('poll'),
              pollInterval(polls.current),
            );
            return;
          }
          fail(String(err.message ?? err));
        });
    },
    [fail],
  );

  // Recrawl: start a new crawl, then poll until it completes.
  const reload = useCallback(() => run('trigger'), [run]);
  // Cancel: stop the crawl and show whatever the last completed one left.
  const cancel = useCallback(() => run('cancel'), [run]);

  useEffect(() => {
    // On open, read the latest crawl (poll=1) — fast, and never burns a crawl.
    run('poll');
    return () => {
      // Kill the chain, not just the armed timer: a response still in flight
      // would otherwise arm a fresh timer after unmount, and the loop would
      // keep polling a page nobody is on.
      generation.current += 1;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [run]);

  return {
    audit,
    error,
    connectPrompt,
    reloading,
    reload,
    cancel,
    cancelling,
    cancelFailed,
    noReport,
    progress,
    takingLong,
  };
}
