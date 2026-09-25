import { translate } from '@ui';
import { useCallback } from 'react';

import { usePoll } from '../../../hooks/use-poll';
import { useRefSet } from '../../../hooks/use-ref-set';
import { trackIssues } from '../../../tracking/issues';
import { MAX_POLLS, POLL_INTERVAL_MS } from '../const/fix-preview';
import { errorMessage, lostAccountMessage } from '../helpers/error-message';
import {
  fetchPreview,
  type PreviewEndpoint,
  type PreviewResponse,
} from '../services/fix-preview';
import type { usePlanGate } from './use-plan-gate';

type UseSuggestionGenerationParams = {
  issueId: string;
  endpoint: PreviewEndpoint;
  planGate: ReturnType<typeof usePlanGate>;
  /** Merges a response's rows and credit balance into the shared preview. */
  applyResponse: (data: PreviewResponse) => void;
  /** Re-reads the fixable pages; already single-flighted by its owner. */
  refreshList: () => void;
  setError: (message: string | null) => void;
};

/**
 * Step 2 — kick off ONE page's suggestion (the only chargeable call), then poll
 * that page until it's ready.
 *
 * The kick-off and the poll hit the same endpoint but read differently: only
 * the kick-off can be refused for plan reasons, because only it spends a
 * credit. Everything after it is the same page settling.
 */
export function useSuggestionGeneration({
  issueId,
  endpoint,
  planGate,
  applyResponse,
  refreshList,
  setError,
}: UseSuggestionGenerationParams) {
  const generating = useRefSet();
  const poll = usePoll({
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLLS,
  });

  /**
   * A settled (non-pending) response that carries NO row for the requested page
   * means the backend no longer lists it for this issue (its target scan changed
   * since the drawer opened — e.g. the issue got resolved another way). Without
   * this, the click dies silently: nothing merges and the card just snaps back.
   * Surface it and refresh the list so the drawer matches reality.
   */
  const handleMissingRow = (data: PreviewResponse, ref: string) => {
    if (data.pending || data.rows?.some((row) => row.ref === ref)) return;
    // Refresh before the message: the list read clears the error state, so
    // setting it after is what keeps it visible.
    refreshList();
    setError(translate('page_no_longer_flagged'));
  };

  /** One poll of a page mid-generation. True asks for another. */
  const pollOnce = async (ref: string): Promise<boolean> => {
    const data = await fetchPreview(
      endpoint,
      issueId,
      `&poll=1&ref=${encodeURIComponent(ref)}`,
    );

    const lostAccount = lostAccountMessage(data);
    if (lostAccount) {
      setError(lostAccount);
      return false;
    }
    if (planGate.blockedByMissingProject(data)) return false;
    if (data.error) {
      setError(data.error);
      return false;
    }

    applyResponse(data);
    if (data.pending) return true;
    handleMissingRow(data, ref);
    return false;
  };

  const runGeneration = async (ref: string, kickoff: string) => {
    // Wraps the response handling too, not just the request: a throw while
    // reading the response has to reach the drawer's error line rather than
    // clear the spinner in silence.
    try {
      const data = await fetchPreview(
        endpoint,
        issueId,
        `${kickoff}&ref=${encodeURIComponent(ref)}`,
      );

      const lostAccount = lostAccountMessage(data);
      if (lostAccount) {
        setError(lostAccount);
        return;
      }
      if (planGate.blockedByFreePlan(data)) return;
      if (planGate.blockedByMissingProject(data)) return;
      if (data.error) {
        setError(data.error);
        return;
      }

      // The server allowed a chargeable call, so the account isn't free —
      // clears a stale local flag after an upgrade.
      planGate.recordPlanVerdict(false);
      applyResponse(data);
      if (!data.pending) {
        handleMissingRow(data, ref);
        return;
      }

      // Running out of budget is silent: the page is still generating on the
      // backend, and a timeout notice would only tell the user to wait.
      await poll.start(ref, () => pollOnce(ref), {
        onError: (error) => setError(errorMessage(error)),
      });
    } catch (error) {
      setError(errorMessage(error));
    }
  };

  /**
   * `regenerate` forces a fresh, different suggestion (bypasses the server
   * cache, costs 1 credit instead of 2) — same generate path, just a different
   * flag, mirroring the Ubersuggest web app.
   */
  const fireGeneration = (ref: string, regenerate: boolean) => {
    const refreshPlan = planGate.openChargeableCall();
    // The event fires either way — the click is the intent — but `blocked`
    // separates paywalled clicks from real attempts so funnels keep an honest
    // denominator.
    trackIssues('GENERATE_SUGGESTION_CLICK', {
      issue: issueId,
      action: regenerate ? 'regenerate' : 'generate',
      blocked: refreshPlan === null,
    });
    if (refreshPlan === null) return; // the paywall took the click instead
    setError(null);
    const start = regenerate ? '&regenerate=1' : '&start=1';
    void generating.track(ref, runGeneration(ref, `${start}${refreshPlan}`));
  };

  /** The drawer closed: nothing is worth polling for a page nobody can see. */
  const cancelGeneration = useCallback(() => {
    poll.stopAll();
    generating.clear();
  }, [poll.stopAll, generating.clear]);

  return {
    generatingRefs: generating.refs,
    generateRow: (ref: string) => fireGeneration(ref, false),
    regenerateRow: (ref: string) => fireGeneration(ref, true),
    cancelGeneration,
  };
}
