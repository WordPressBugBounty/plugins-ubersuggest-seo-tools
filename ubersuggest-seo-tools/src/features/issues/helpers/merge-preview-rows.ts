import type { PreviewRow } from '../types';
import { hasSuggestion } from './suggestion-rows';

/**
 * Folds a fresh list of fixable pages over the rows already on screen.
 *
 * The server's list step is not the whole truth — its cached-suggestion read is
 * filtered by the crawl breakdown, so it can miss pages the plugin fixed or
 * generated locally. Three invariants keep the drawer from throwing away work
 * the user can see:
 *
 * 1. A page confirmed fixed stays fixed. The server's cached suggestion for it
 *    must never demote the green card back to a suggestion — the card only
 *    leaves when the crawl stops listing the page at all.
 * 2. A suggestion already on screen survives a fresh row that brings none.
 * 3. Pages fixed this session leave the server's target scan, so the fresh list
 *    no longer carries them. Their green cards stay instead of silently
 *    dropping the user's confirmation.
 */
export function mergePreviewRows(
  existing: PreviewRow[] | null,
  fresh: PreviewRow[],
): PreviewRow[] {
  if (!existing) return fresh;

  const previousByRef = new Map(existing.map((row) => [row.ref, row]));
  const merged = fresh.map((row) => {
    const previous = previousByRef.get(row.ref);
    if (previous?.status === 'fixed' && row.status !== 'fixed') return previous;
    return !hasSuggestion(row) && hasSuggestion(previous) ? previous : row;
  });

  const freshRefs = new Set(fresh.map((row) => row.ref));
  const fixedKept = existing.filter(
    (row) => row.status === 'fixed' && !freshRefs.has(row.ref),
  );
  return [...merged, ...fixedKept];
}
