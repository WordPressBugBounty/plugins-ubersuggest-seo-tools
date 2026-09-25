import type { PreviewRow } from '../../types';

/** The mutually exclusive things a card's action area can show. */
export type CardState =
  | 'info' // issue the backend can't generate for — no action area at all
  | 'fixed' // applied (green)
  | 'pending' // generating
  | 'suggestion' // a suggestion to apply / copy / edit / regenerate
  | 'blocked' // out of credits
  | 'failed' // generation settled with nothing — offer a retry
  | 'idle'; // nothing yet — offer Generate

/**
 * Which state a row is in. The order below IS the precedence, readable in one
 * pass and testable without rendering — it replaces a six-deep ternary chain
 * where each branch's meaning depended on every condition above it.
 */
export function cardState(
  row: PreviewRow,
  generating: boolean,
  canAfford: boolean,
): CardState {
  if (row.status === 'info') return 'info';
  if (row.status === 'fixed') return 'fixed';
  if (generating || row.status === 'pending') return 'pending';
  if (row.after != null && row.after !== '') return 'suggestion';
  if (row.status === 'limit' || !canAfford) return 'blocked';
  if (row.status === 'fallback') return 'failed';
  return 'idle';
}
