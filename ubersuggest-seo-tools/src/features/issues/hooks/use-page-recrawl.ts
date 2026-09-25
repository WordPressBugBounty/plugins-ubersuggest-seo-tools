import { translate } from '@ui';
import { useCallback, useRef, useState } from 'react';

import { usePoll } from '../../../hooks/use-poll';
import { useRefSet } from '../../../hooks/use-ref-set';
import { withoutKey } from '../../../lib/records';
import {
  MAX_RECRAWL_POLLS,
  RECRAWL_POLL_INTERVAL_MS,
} from '../const/fix-preview';
import { errorMessage, lostAccountMessage } from '../helpers/error-message';
import { fetchPageRecrawl } from '../services/fix-preview';
import type { RecrawlVerdict } from '../types';

/**
 * Step 4 — re-crawl ONE fixed page to confirm the crawl agrees the issue is
 * gone. This crawls the page on its own, so the issue counts on the dashboard
 * don't move until the next full crawl; the card says so.
 *
 * Verdicts are kept out of `PreviewRow`: they describe the CRAWL's view of the
 * page, not the suggestion, so the preview row merge must never carry a stale
 * one over from a previous list read.
 *
 * @param setError writes to the drawer's shared error line; null clears it.
 */
export function usePageRecrawl(
  issueId: string,
  setError: (message: string | null) => void,
) {
  const recrawling = useRefSet();
  const [verdicts, setVerdicts] = useState<Record<string, RecrawlVerdict>>({});
  // Which run of each page's crawl is the live one. Stopping the poll can't
  // recall a request already in flight, and that request's answer describes a
  // state the page has since left — an undo, or a newer crawl.
  const runIds = useRef<Map<string, number>>(new Map());
  const startRun = useCallback((ref: string) => {
    const runId = (runIds.current.get(ref) ?? 0) + 1;
    runIds.current.set(ref, runId);
    return () => runIds.current.get(ref) === runId;
  }, []);
  const poll = usePoll({
    intervalMs: RECRAWL_POLL_INTERVAL_MS,
    maxAttempts: MAX_RECRAWL_POLLS,
  });

  const recrawlRow = (ref: string) => {
    setError(null);
    // Drop any previous verdict for this page: leaving the old one on screen
    // while the new crawl runs would show a verdict that no longer applies.
    setVerdicts((current) => withoutKey(current, ref));

    const isLiveRun = startRun(ref);
    // The kick-off and every follow-up hit the same endpoint; only the first
    // one omits poll=1, which is what starts the crawl.
    let kickoff = true;
    const attempt = async () => {
      const data = await fetchPageRecrawl(
        issueId,
        ref,
        kickoff ? '' : '&poll=1',
      );
      kickoff = false;
      if (!isLiveRun()) return false;

      const lostAccount = lostAccountMessage(data);
      if (lostAccount) {
        setError(lostAccount);
        return false;
      }
      if (data.error) {
        setError(data.error);
        return false;
      }
      if (data.pending) return true;
      const { verdict } = data;
      if (verdict) setVerdicts((current) => ({ ...current, [ref]: verdict }));
      return false;
    };

    void recrawling.track(
      ref,
      poll.start(ref, attempt, {
        immediate: true,
        onExhausted: () => setError(translate('crawl_taking_long')),
        onError: (error) => setError(errorMessage(error)),
      }),
    );
  };

  /**
   * The page's fix was undone: a verification crawl still polling for it
   * describes the pre-undo state, and left running it would resurrect its
   * verdict later.
   */
  const forgetRow = useCallback(
    (ref: string) => {
      startRun(ref); // retires the live run without starting one
      poll.stop(ref);
      recrawling.remove(ref);
      setVerdicts((current) => withoutKey(current, ref));
    },
    [poll.stop, recrawling.remove, startRun],
  );

  /** The drawer closed: stop every crawl, but keep the verdicts already in. */
  const cancelRecrawls = useCallback(() => {
    poll.stopAll();
    recrawling.clear();
  }, [poll.stopAll, recrawling.clear]);

  return {
    recrawlingRefs: recrawling.refs,
    verdicts,
    recrawlRow,
    forgetRow,
    cancelRecrawls,
  };
}
