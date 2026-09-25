import {
  Button,
  cn,
  LoadingSpinner,
  Text,
  type TranslationKeys,
  translate,
} from '@ui';
import { useId } from 'react';

import {
  dynamicKey,
  translateDynamic,
} from '../../../../i18n/translate-dynamic';
import { CheckIcon, ExternalLinkIcon } from '../../../../icons';
import type { PreviewRow, RecrawlVerdict } from '../../types';
import { cardState } from './card-state';
import { FixedPanel } from './fixed-panel';
import { SuccessState } from './success-state';
import { SuggestionPanel } from './suggestion-panel';

// The purple glow the dashboard animates onto an expanded card, paired with
// its blue border. Inline for the same reason as the panel gradient: an rgba
// shadow as a Tailwind arbitrary value is a wall of underscores.
//
// Marks the one expanded card, as in the dashboard. A fixed card is exempt: it
// keeps its green "done" treatment either way.
const CARD_GLOW = '0px 4px 10px 0px rgba(204,133,255,0.5)';
// Same shadow at zero spread and zero alpha, not `none`: a shadow can only
// transition into another shadow, so collapsing has to ease back to this
// rather than blink off.
const CARD_NO_GLOW = '0px 0px 0px 0px rgba(204,133,255,0)';

/**
 * One affected page: title + URL chip, its current value, and the suggestion
 * area with every state — Generate, pending spinner, the suggestion box with
 * Apply (or Copy on manual issues) / Edit / Regenerate, fixed (green, with the
 * per-page re-crawl check), credit limit, failed-with-retry, and info-only (no
 * backend generation available).
 *
 * This is the card's shell: expand/collapse, header, and the page's facts. The
 * two big states live in their own files — SuccessState (the suggestion, with
 * its edit mode) and FixedPanel (applied + re-crawl); the small ones stay
 * inline, mirroring the dashboard's code-fix-card.
 */
export function PreviewCard({
  row,
  generating,
  applying,
  recrawling,
  reverting,
  verdict,
  fixedAt,
  canAfford,
  canApply,
  cost,
  maxChars,
  emptyValueKey,
  undoEmptyBodyKey,
  expanded,
  onActivate,
  onGenerate,
  onRegenerate,
  onEdit,
  onApply,
  onRecrawl,
  onRevert,
  onFreePlanUpgrade,
}: {
  row: PreviewRow;
  generating: boolean;
  applying: boolean;
  /** This page's verification crawl is in flight. */
  recrawling: boolean;
  /** This page's undo is in flight. */
  reverting: boolean;
  /** What the last verification crawl found, absent until one has finished. */
  verdict?: RecrawlVerdict;
  /** When this page's fix was applied (epoch ms), for the recrawl cooldown. */
  fixedAt?: number;
  canAfford: boolean;
  canApply: boolean;
  cost: number;
  maxChars: number;
  /** What to show in place of a current value the page simply doesn't have. */
  emptyValueKey: string;
  /** Undo-confirm wording when there is no value to restore (issue-specific). */
  undoEmptyBodyKey?: TranslationKeys;
  /** Collapsed to title + URL when false. The list decides — only one is open. */
  expanded: boolean;
  onActivate: () => void;
  onGenerate: (ref: string) => void;
  onRegenerate: (ref: string) => void;
  onEdit: (ref: string, value: string) => void;
  onApply: (ref: string) => void;
  onRecrawl: (ref: string) => void;
  onRevert?: (ref: string) => void;
  onFreePlanUpgrade?: () => void;
}) {
  // Ties the title button to the region it opens, the way a disclosure should.
  const panelId = useId();

  const state = cardState(row, generating, canAfford);
  const fixed = state === 'fixed';
  // Independent of `state`: a row CAN show its suggestion while the account is
  // out of credits, which is what disables Regenerate in the suggestion box.
  const blocked = row.status === 'limit' || !canAfford;
  const hasBlockedReason =
    row.blockedReason != null && row.blockedReason !== '';
  // The current value shows even when the page has none — "No H1 heading" IS
  // the finding. The exception is a card already explaining itself through the
  // blocked-reason block, where a second "No value found" is noise.
  const showCurrentValue = row.before !== '' || !hasBlockedReason;

  // A collapsed card hides everything that would tell you generation is running
  // or finished, so it says so on the title row instead — otherwise the only
  // way to find out is to hover every card in the list.
  const collapsedStatus =
    state === 'pending' ? (
      <Text
        size="sm"
        color="muted"
        className="flex shrink-0 items-center gap-1"
      >
        <LoadingSpinner size={16} className="text-zinc-500" />
        {translate('generating_ai')}
      </Text>
    ) : state === 'suggestion' ? (
      <Text
        size="sm"
        color="muted"
        className="flex shrink-0 items-center gap-1"
      >
        {translate('suggestion_available')}
        <CheckIcon size={16} className="text-green-600" />
      </Text>
    ) : null;

  return (
    // Hover expands, as in the dashboard. `onFocusCapture` is the keyboard
    // equivalent — tabbing into anything inside must reveal it, or focus would
    // land on controls the user can't see.
    //
    // biome-ignore lint/a11y/noStaticElementInteractions: both handlers only duplicate the title button's toggle, which is a real control carrying aria-expanded. The card holds a button, links and a textarea, so it can't take a widget role itself, and a grouping role would only claim semantics it doesn't have. Nothing here is pointer-only.
    <div
      onMouseEnter={onActivate}
      onFocusCapture={onActivate}
      className={cn(
        'rounded-xl border p-5 transition-[border-color,box-shadow] duration-[350ms] ease-in-out',
        fixed && 'border-emerald-200 bg-emerald-50',
        !fixed && expanded && 'border-blue-600 bg-white',
        !fixed && !expanded && 'border-zinc-200 bg-white',
      )}
      style={
        fixed ? undefined : { boxShadow: expanded ? CARD_GLOW : CARD_NO_GLOW }
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onActivate}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <Text
              as="span"
              size="lg"
              weight="bold"
              className="text-zinc-800 leading-7"
            >
              {row.label}
            </Text>
          </button>
          {!expanded && collapsedStatus}
        </div>
        {row.url && (
          <div className="inline-flex h-[26px] w-fit max-w-full items-center gap-1 rounded-[6px] bg-zinc-100 px-2">
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 font-medium text-xs text-zinc-600 hover:text-zinc-900"
            >
              <span className="min-w-0 truncate underline">{row.url}</span>
              <ExternalLinkIcon size={14} className="shrink-0 text-zinc-500" />
            </a>
          </div>
        )}
      </div>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows,opacity] duration-[350ms] ease-in-out"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          opacity: expanded ? 1 : 0,
        }}
        // Collapsed content stays in the DOM (that's what lets it animate), so
        // without this its buttons would still take Tab focus and be read out
        // while invisible. Tabbing to the title instead expands the card, via
        // the focus handler above, and then its controls become reachable.
        inert={!expanded}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 pt-3">
            {hasBlockedReason && (
              <>
                <hr className="border-zinc-100" />
                <div className="flex flex-col gap-0.5">
                  <Text
                    size="sm"
                    weight="medium"
                    className="text-zinc-900"
                    text="col_status"
                  />
                  <Text size="sm" className="text-zinc-600">
                    {`${translate('page_blocked')} (${translateDynamic(
                      `page_blocked_by_${row.blockedReason}`,
                    )})`}
                  </Text>
                </div>
              </>
            )}

            {showCurrentValue && (
              <>
                <hr className="border-zinc-100" />
                <div className="flex flex-col gap-0.5">
                  <Text
                    size="sm"
                    weight="medium"
                    className="text-zinc-900"
                    text="current_value"
                  />
                  {row.before !== '' ? (
                    <Text size="sm" className="break-words text-zinc-600">
                      {row.before}
                    </Text>
                  ) : (
                    <Text
                      size="sm"
                      className="text-zinc-400 italic"
                      text={dynamicKey(emptyValueKey)}
                    />
                  )}
                </div>
              </>
            )}

            {state === 'fixed' && (
              <FixedPanel
                row={row}
                recrawling={recrawling}
                reverting={reverting}
                verdict={verdict}
                fixedAt={fixedAt}
                undoEmptyBodyKey={undoEmptyBodyKey}
                onRecrawl={onRecrawl}
                onRevert={onRevert}
              />
            )}

            {state === 'pending' && (
              <SuggestionPanel>
                <div className="flex min-h-20 items-center gap-2">
                  <LoadingSpinner
                    size={20}
                    className="shrink-0 text-zinc-500"
                  />
                  <Text
                    size="lg"
                    weight="medium"
                    color="muted"
                    text="generating_ai"
                  />
                </div>
              </SuggestionPanel>
            )}

            {state === 'suggestion' && (
              <SuccessState
                row={row}
                applying={applying}
                blocked={blocked}
                canApply={canApply}
                maxChars={maxChars}
                onApply={onApply}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
              />
            )}

            {state === 'blocked' && (
              <div className="flex flex-col items-start gap-2">
                <Text size="sm" color="muted" text="out_of_credits" />
                {/* A free account's steady state IS zero credits, so the
                    conversion moment lives here, not on a Generate button. */}
                {onFreePlanUpgrade && (
                  <Button
                    variant="accent-cta"
                    size="sm"
                    onClick={onFreePlanUpgrade}
                  >
                    <Text
                      size="sm"
                      className="text-white"
                      text="start_free_trial"
                    />
                  </Button>
                )}
              </div>
            )}

            {state === 'failed' && (
              <div className="flex flex-col items-start gap-2">
                <Text size="sm" color="muted" text="couldnt_generate" />
                <Button
                  variant="neutral-outline"
                  size="sm"
                  onClick={() => onGenerate(row.ref)}
                >
                  <Text size="sm" text="try_again" />
                </Button>
              </div>
            )}

            {state === 'idle' && (
              <Button
                variant="accent-cta"
                size="sm"
                onClick={() => onGenerate(row.ref)}
                className="self-start"
              >
                <Text
                  size="sm"
                  className="text-white"
                  text="generate_with_cost"
                  translationConfig={{ translationVariables: [cost] }}
                />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
