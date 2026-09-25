import type { PreviewRow } from '../types';

/** A row carries a suggestion once the backend (or the user) filled `after`. */
export const hasSuggestion = (row: PreviewRow | undefined): row is PreviewRow =>
  row != null && row.after != null && row.after !== '';

/** How many pages have a suggestion at all, applied or not. */
export const generatedCount = (preview: PreviewRow[] | null): number =>
  preview?.filter(hasSuggestion).length ?? 0;

/**
 * Suggestions that are generated but not yet applied — drives the Apply button,
 * so it hides once every generated page has been fixed.
 */
export const hasApplicableSuggestions = (
  preview: PreviewRow[] | null,
): boolean =>
  preview?.some((row) => hasSuggestion(row) && row.status !== 'fixed') ?? false;

/**
 * The pages an apply would actually write.
 *
 * @param refs limits the result to those pages (the per-card Apply button);
 * omit it to take every generated-but-unapplied page (the footer's Apply-all).
 */
export const applyTargets = (
  preview: PreviewRow[] | null,
  refs?: string[],
): PreviewRow[] =>
  preview?.filter(
    (row) =>
      hasSuggestion(row) &&
      row.status !== 'fixed' &&
      row.applyable !== false &&
      (!refs || refs.includes(row.ref)),
  ) ?? [];
