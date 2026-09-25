import { translate } from '@ui';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';

import { useRefSet } from '../../../hooks/use-ref-set';
import { withoutKey } from '../../../lib/records';
import { revertFix } from '../../history/services/fix-history';
import { errorMessage } from '../helpers/error-message';
import { applyTargets } from '../helpers/suggestion-rows';
import { applyFixes } from '../services/fix-preview';
import type { PreviewRow } from '../types';

type UseFixWritesParams = {
  issueId: string;
  manualMode: boolean;
  preview: PreviewRow[] | null;
  setPreview: Dispatch<SetStateAction<PreviewRow[] | null>>;
  /** Re-reads the fixable pages so the drawer matches the server again. */
  reloadList: () => void;
  /** Drops a page's verification crawl: an undo invalidates its verdict. */
  forgetRecrawl: (ref: string) => void;
  setError: (message: string | null) => void;
  onApplied: () => void;
  askForReview: () => void;
};

/**
 * Writing the reviewed suggestions to the site, and taking a write back.
 *
 * Apply and Undo are one concern, not two: the undo offer (`revertId` /
 * `revertTo`) is minted by an apply and consumed by the undo that follows it,
 * both patch the same preview rows, and both own the `fixedAt` clock the
 * recrawl cooldown reads.
 */
export function useFixWrites({
  issueId,
  manualMode,
  preview,
  setPreview,
  reloadList,
  forgetRecrawl,
  setError,
  onApplied,
  askForReview,
}: UseFixWritesParams) {
  const applying = useRefSet();
  const reverting = useRefSet();
  // When each ref's fix was applied (epoch ms) — drives the recrawl cooldown.
  const [fixedAt, setFixedAt] = useState<Record<string, number>>({});

  /** Rewrites one page's row in place, leaving every other row untouched. */
  const patchRow = (ref: string, changes: Partial<PreviewRow>) => {
    setPreview(
      (current) =>
        current?.map((row) =>
          row.ref === ref ? { ...row, ...changes } : row,
        ) ?? current,
    );
  };

  /**
   * The server didn't write pages we asked it to — they dropped out of the
   * target scan since the preview (fixed elsewhere, deleted). Refresh so the
   * drawer matches reality instead of confirming a lie.
   */
  const reportStalePages = () => {
    reloadList();
    setError(translate('page_no_longer_flagged'));
  };

  const runApply = async (rows: PreviewRow[], targets: string[]) => {
    const values = Object.fromEntries(rows.map((row) => [row.ref, row.after]));
    const sources = Object.fromEntries(
      rows.map((row) => [row.ref, row.source === 'edited' ? 'edited' : 'ai']),
    );

    try {
      const data = await applyFixes(issueId, values, sources);

      if (!data.ok) {
        if (data.code === 'nothing_applied') {
          reportStalePages();
          return;
        }
        setError(data.error ?? 'Something went wrong.');
        return;
      }

      // Mark fixed ONLY what the server says it actually wrote — never assume
      // the full request landed. Keep the preview open so fixing one page shows
      // in place and the rest stay generatable.
      const applied = new Set(data.appliedRefs ?? targets);
      const appliedNow = Date.now();
      setFixedAt((current) => ({
        ...current,
        ...Object.fromEntries([...applied].map((ref) => [ref, appliedNow])),
      }));
      const offers = data.revertOffers ?? {};
      setPreview(
        (current) =>
          current?.map((row) =>
            applied.has(row.ref)
              ? {
                  ...row,
                  status: 'fixed',
                  revertId: offers[row.ref]?.id,
                  revertTo: offers[row.ref]?.to,
                }
              : row,
          ) ?? current,
      );

      // Some requested pages weren't written (stale between preview and apply).
      const missing = targets.filter((ref) => !applied.has(ref));
      if (missing.length > 0) reportStalePages();
      onApplied();
      if (data.shouldAskForReview && missing.length === 0) askForReview();
    } catch (error) {
      setError(errorMessage(error));
    }
  };

  const runRevert = async (ref: string, revertId: number) => {
    try {
      const data = await revertFix(revertId);

      if (!data.ok) {
        setError(data.error ?? translate('page_no_longer_flagged'));
        // Every refusal reason is permanent, so this row's undo offer is dead:
        // drop it, or the button stays and every further click repeats the same
        // refusal. Done locally rather than by re-listing, which would clear
        // the error message we just set.
        patchRow(ref, { revertId: undefined, revertTo: undefined });
        return;
      }

      // The reverted page comes back as a suggestion (still cached server-side,
      // so no re-charge), and the outer issues list drops the fixed credit.
      patchRow(ref, {
        status: 'idle',
        after: null,
        revertId: undefined,
        revertTo: undefined,
      });
      setFixedAt((current) => withoutKey(current, ref));
      forgetRecrawl(ref);
      reloadList();
      onApplied();
    } catch (error) {
      setError(errorMessage(error));
    }
  };

  /**
   * @param refs applies only those pages (the per-card Apply button); omit to
   * apply every generated-but-unapplied page (the footer's Apply-all).
   */
  const applyRows = (refs?: string[]) => {
    if (manualMode) return; // manual issues have nothing to apply
    const rows = applyTargets(preview, refs);
    if (rows.length === 0) return;

    const targets = rows.map((row) => row.ref);
    setError(null);
    // One request for the whole batch, but every page in it reads as busy
    // until that request settles.
    const work = runApply(rows, targets);
    for (const ref of targets) void applying.track(ref, work);
  };

  const revertRow = (ref: string) => {
    const row = preview?.find((candidate) => candidate.ref === ref);
    if (!row?.revertId || reverting.has(ref)) return;
    setError(null);
    void reverting.track(ref, runRevert(ref, row.revertId));
  };

  const cancelWrites = useCallback(() => applying.clear(), [applying.clear]);

  return {
    fixedAt,
    applyingRefs: applying.refs,
    applyRow: (ref: string) => applyRows([ref]),
    applyAll: () => applyRows(),
    revertingRefs: reverting.refs,
    revertRow,
    cancelWrites,
  };
}
