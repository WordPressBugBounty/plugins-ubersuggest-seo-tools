import type { TranslationKeys } from '@ui';
import { useState } from 'react';

import type { PreviewRow, RecrawlVerdict } from '../../types';
import { PreviewCard } from './preview-card';

/**
 * The list orchestrator: one spaced PreviewCard per affected page — mirrors the
 * dashboard's "Choose a page to fix" layout. Translates the hook's per-ref
 * state arrays into each card's booleans and passes the shared config through.
 *
 * It also owns which card is expanded, because only one is at a time — the
 * cards can't decide that among themselves. Nothing collapses on mouse-out:
 * the open card stays open until another takes over, so a card can't shut
 * mid-edit just because the pointer drifted off it.
 */
export function PreviewCards({
  rows,
  generatingRefs,
  applyingRefs,
  recrawlingRefs,
  revertingRefs = [],
  verdicts,
  fixedAt,
  canAfford,
  canApply,
  cost,
  maxChars,
  emptyValueKey,
  undoEmptyBodyKey,
  onGenerate,
  onRegenerate,
  onEdit,
  onApply,
  onRecrawl,
  onRevert,
  onFreePlanUpgrade,
}: {
  rows: PreviewRow[];
  generatingRefs: string[];
  applyingRefs: string[];
  recrawlingRefs: string[];
  revertingRefs?: string[];
  /** Last verification-crawl outcome per page ref, keyed the same as the rows. */
  verdicts: Record<string, RecrawlVerdict>;
  /** When each ref's fix was applied (epoch ms) — drives the recrawl cooldown. */
  fixedAt?: Record<string, number>;
  canAfford: boolean;
  /** False for manual issues: the suggestion is copied, never applied. */
  canApply: boolean;
  cost: number;
  maxChars: number;
  emptyValueKey: string;
  undoEmptyBodyKey?: TranslationKeys;
  onGenerate: (ref: string) => void;
  onRegenerate: (ref: string) => void;
  onEdit: (ref: string, value: string) => void;
  onApply: (ref: string) => void;
  onRecrawl: (ref: string) => void;
  onRevert?: (ref: string) => void;
  /** Free plan: the blocked (out of credits) card offers the trial paywall. */
  onFreePlanUpgrade?: () => void;
}) {
  const [expandedRef, setExpandedRef] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <PreviewCard
          key={row.ref}
          row={row}
          expanded={expandedRef === row.ref}
          onActivate={() => setExpandedRef(row.ref)}
          generating={generatingRefs.includes(row.ref)}
          applying={applyingRefs.includes(row.ref)}
          recrawling={recrawlingRefs.includes(row.ref)}
          reverting={revertingRefs.includes(row.ref)}
          verdict={verdicts[row.ref]}
          fixedAt={fixedAt?.[row.ref]}
          canAfford={canAfford}
          canApply={canApply}
          cost={cost}
          maxChars={maxChars}
          emptyValueKey={emptyValueKey}
          undoEmptyBodyKey={undoEmptyBodyKey}
          onGenerate={onGenerate}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onApply={onApply}
          onRecrawl={onRecrawl}
          onRevert={onRevert}
          onFreePlanUpgrade={onFreePlanUpgrade}
        />
      ))}
    </div>
  );
}
