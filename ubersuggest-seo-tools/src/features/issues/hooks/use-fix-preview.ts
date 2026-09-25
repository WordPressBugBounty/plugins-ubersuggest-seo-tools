import { useCallback, useRef, useState } from 'react';

import type { NotConnectedFields } from '../../../ui/connect-account-card';
import { useReviewAsk } from '../../review/review-ask-context';
import { errorMessage, lostAccountMessage } from '../helpers/error-message';
import { mergePreviewRows } from '../helpers/merge-preview-rows';
import {
  generatedCount as countGenerated,
  hasApplicableSuggestions,
} from '../helpers/suggestion-rows';
import {
  fetchPreview,
  type PreviewResponse,
  previewEndpoint,
} from '../services/fix-preview';
import type { Credits, PreviewRow } from '../types';
import { useFixWrites } from './use-fix-writes';
import { usePageRecrawl } from './use-page-recrawl';
import { usePlanGate } from './use-plan-gate';
import { useSuggestionGeneration } from './use-suggestion-generation';

/**
 * Fix-preview state for one issue: list the affected pages, generate a
 * suggestion one page at a time (each is a paid call, gated by the credit
 * balance), poll each until ready, then apply. In `manualMode` (issues
 * with no local fix) the same flow runs against the issue-pages endpoint:
 * pages are crawl URLs, suggestions can be generated / copied / edited /
 * regenerated, and there is nothing to apply.
 */
export function useFixPreview(
  issueId: string,
  onApplied: () => void,
  manualMode = false,
) {
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [opening, setOpening] = useState(false); // listing the fixable pages
  const [error, setError] = useState<string | null>(null);
  const recrawl = usePageRecrawl(issueId, setError);
  const planGate = usePlanGate();
  // Mirror of `opening` for the poll chain: a scheduled setTimeout closure is
  // pinned to the render it was created in, so reading the `opening` state
  // there would see a stale snapshot forever. A ref is a shared box — even a
  // stale closure reads the CURRENT value through it.
  const openingRef = useRef(false);
  // Monotonic id of the latest openPreview call; stale responses are dropped.
  const previewFetchSeq = useRef(0);
  const askForReview = useReviewAsk();

  const generatedCount = countGenerated(preview);
  const hasSuggestions = hasApplicableSuggestions(preview);
  // Unknown balance (null) doesn't block — the backend still enforces the cap and
  // reports a 'limit' row, so we never silently overspend.
  const canAfford = credits === null || credits.remaining >= credits.cost;

  const endpoint = previewEndpoint(manualMode);

  /** True when the response replaced its payload with a lost-account notice. */
  const handleLostAccount = useCallback((data: NotConnectedFields): boolean => {
    const message = lostAccountMessage(data);
    if (!message) return false;
    setError(message);
    return true;
  }, []);

  // Merge one page's row back into the table by ref, so generating a single page
  // never clobbers the others; refresh the credit balance whenever it's present.
  const applyResponse = useCallback((data: PreviewResponse) => {
    if (data.credits) setCredits(data.credits);
    setPreview((rows) =>
      rows
        ? rows.map(
            (existing) =>
              data.rows?.find((row) => row.ref === existing.ref) ?? existing,
          )
        : rows,
    );
  }, []);

  // Step 1 — list the fixable pages (idle rows) + the credit balance. No backend
  // generation, so opening a category never spends credits; the fresh list is
  // folded over what is already on screen rather than replacing it.
  const openPreview = useCallback(() => {
    // Only the NEWEST list request may land: a slow response issued before an
    // apply/undo would otherwise re-pin rows the action just changed.
    const requestSeq = ++previewFetchSeq.current;
    setOpening(true);
    openingRef.current = true;
    setError(null);
    fetchPreview(endpoint, issueId, '')
      .then((data) => {
        if (requestSeq !== previewFetchSeq.current) return;
        setOpening(false);
        openingRef.current = false;
        if (handleLostAccount(data)) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        planGate.recordPlanVerdict(data.freePlan);
        const rows = data.rows ?? [];
        setPreview((existing) => mergePreviewRows(existing, rows));
        if (data.credits) setCredits(data.credits);
      })
      .catch((err) => {
        if (requestSeq !== previewFetchSeq.current) return;
        setOpening(false);
        openingRef.current = false;
        setError(errorMessage(err));
      });
  }, [endpoint, issueId, handleLostAccount, planGate.recordPlanVerdict]);

  const refreshList = useCallback(() => {
    if (!openingRef.current) openPreview();
  }, [openPreview]);

  const generation = useSuggestionGeneration({
    issueId,
    endpoint,
    planGate,
    applyResponse,
    refreshList,
    setError,
  });
  const generating = generation.generatingRefs.length > 0;

  // Replace one page's suggestion with the user's own edited text. Apply writes
  // whatever is in `after`, so an edited value is what gets saved (no re-charge).
  const editRow = (ref: string, value: string) =>
    setPreview((rows) =>
      rows
        ? rows.map((row) =>
            row.ref === ref ? { ...row, after: value, source: 'edited' } : row,
          )
        : rows,
    );

  const writes = useFixWrites({
    issueId,
    manualMode,
    preview,
    setPreview,
    reloadList: openPreview,
    forgetRecrawl: recrawl.forgetRow,
    setError,
    onApplied,
    askForReview,
  });
  // Closing the drawer stops polling but keeps the last preview + credits in
  // memory, so reopening shows the generated suggestions instantly. openPreview
  // then refetches from the server cache to freshen them (survives a reload too).
  const cancelPreview = () => {
    generation.cancelGeneration();
    writes.cancelWrites();
    // Verdicts survive: they're the result of a finished crawl, so reopening the
    // drawer should still show what it found rather than making the user re-crawl.
    recrawl.cancelRecrawls();
  };

  const applying = writes.applyingRefs.length > 0;

  return {
    preview,
    credits,
    opening,
    generatingRefs: generation.generatingRefs,
    generating,
    applyingRefs: writes.applyingRefs,
    applying,
    recrawlingRefs: recrawl.recrawlingRefs,
    verdicts: recrawl.verdicts,
    fixedAt: writes.fixedAt,
    error,
    freePlan: planGate.freePlan,
    freePaywall: planGate.freePaywall,
    openFreePaywall: planGate.openFreePaywall,
    dismissFreePaywall: planGate.dismissFreePaywall,
    markUpgradeAttempted: planGate.markUpgradeAttempted,
    projectCta: planGate.projectCta,
    dismissProjectCta: planGate.dismissProjectCta,
    generatedCount,
    hasSuggestions,
    canAfford,
    openPreview,
    generateRow: generation.generateRow,
    regenerateRow: generation.regenerateRow,
    editRow,
    cancelPreview,
    applyRow: writes.applyRow,
    applyAll: writes.applyAll,
    recrawlRow: recrawl.recrawlRow,
    revertRow: writes.revertRow,
    revertingRefs: writes.revertingRefs,
  };
}
