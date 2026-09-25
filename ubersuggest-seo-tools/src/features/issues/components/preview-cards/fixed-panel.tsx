import { Button, Text, type TranslationKeys, translate } from '@ui';
import { useEffect, useState } from 'react';

import { dynamicKey } from '../../../../i18n/translate-dynamic';
import { CheckIcon, RefreshIcon } from '../../../../icons';
import { UndoFixDialog } from '../../../../ui/undo-fix-dialog';
import type { PreviewRow, RecrawlVerdict } from '../../types';

/**
 * Wait after an apply before Recrawl enables: the crawler ignores a re-crawl
 * of a page it crawled under a minute ago (it would serve the OLD report as
 * 'too_soon'), and the fix needs a moment to be live anyway.
 */
const RECRAWL_COOLDOWN_MS = 60_000;

/** How each re-crawl verdict reads on the card. */
const VERDICT_LABELS: Record<
  RecrawlVerdict,
  { key: string; className: string }
> = {
  fixed: {
    key: 'recrawl_confirmed',
    className: 'font-medium text-emerald-700',
  },
  still_flagged: {
    key: 'recrawl_still_flagged',
    className: 'font-medium text-amber-700',
  },
  too_soon: { key: 'recrawl_too_soon', className: 'text-zinc-500' },
  unknown: { key: 'recrawl_unknown', className: 'text-zinc-500' },
};

/**
 * The applied (green) state: the value that was written, the per-page
 * verification crawl and its last verdict. Plugin-only — the dashboard card
 * has no per-page apply, so no Next counterpart to mirror.
 */
export function FixedPanel({
  row,
  recrawling,
  reverting = false,
  verdict,
  fixedAt,
  undoEmptyBodyKey = 'undo_fix_body_empty',
  onRecrawl,
  onRevert,
}: {
  row: PreviewRow;
  recrawling: boolean;
  reverting?: boolean;
  verdict?: RecrawlVerdict;
  /** When this fix was applied (epoch ms); absent = no cooldown. */
  fixedAt?: number;
  /** What an undo with no value to restore does — H1 removes a heading, the rest clear a field. */
  undoEmptyBodyKey?: TranslationKeys;
  onRecrawl: (ref: string) => void;
  onRevert?: (ref: string) => void;
}) {
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const undoable = row.revertId != null && onRevert != null;
  // Hidden while the crawl runs: the spinning icon is the live state, and the
  // previous verdict no longer describes it.
  const verdictLabel =
    verdict && !recrawling ? VERDICT_LABELS[verdict] : undefined;

  const readyAt = fixedAt != null ? fixedAt + RECRAWL_COOLDOWN_MS : 0;
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((readyAt - now) / 1000));

  useEffect(() => {
    if (readyAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= readyAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [readyAt]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-1 font-semibold text-emerald-700 text-sm">
          <CheckIcon size={14} className="shrink-0" />
          {translate('fixed')}
        </span>
        <Text size="sm" className="text-zinc-900">
          {row.after}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="neutral-outline"
          size="sm"
          loading={recrawling}
          disabled={recrawling || secondsLeft > 0}
          onClick={() => onRecrawl(row.ref)}
          data-testid="page-recrawl"
        >
          {/* Hidden while loading, or the DS spinner joins it as a second circle. */}
          {!recrawling && <RefreshIcon size={16} />}
          <Text size="xs" weight="medium" className="uppercase tracking-wide">
            {recrawling
              ? translate('recrawling_page')
              : secondsLeft > 0
                ? `${translate('recrawl_page')} (${secondsLeft})`
                : translate('recrawl_page')}
          </Text>
        </Button>
        {undoable && (
          <Button
            variant="neutral-outline"
            size="sm"
            loading={reverting}
            disabled={reverting}
            onClick={() => setConfirmingUndo(true)}
            data-testid="fix-undo"
          >
            <Text size="xs" weight="medium" className="uppercase tracking-wide">
              {translate('undo_fix')}
            </Text>
          </Button>
        )}
        {verdictLabel && (
          <Text
            size="xs"
            className={verdictLabel.className}
            text={dynamicKey(verdictLabel.key)}
          />
        )}
      </div>
      {verdict === 'fixed' && (
        <Text size="xs" color="muted" text="recrawl_counts_note" />
      )}

      {/* confirmingUndo can only turn true through the (undoable-only) button. */}
      <UndoFixDialog
        open={confirmingUndo}
        restores={(row.revertTo ?? '') !== ''}
        restoredValue={row.revertTo ?? ''}
        emptyBodyKey={undoEmptyBodyKey}
        // Above the drawer's z-[100000] (see SideDrawer), like the paywall.
        zIndex="z-[100001]"
        onClose={() => setConfirmingUndo(false)}
        onConfirm={() => onRevert?.(row.ref)}
      />
    </div>
  );
}
