import type { Issue } from './types';

/** Resolved = the crawl no longer flags it, or the fix was applied and awaits recrawl. */
export const isResolved = (issue: Issue) =>
  issue.fix?.state === 'ok' || issue.fix?.applied === true;

/** The row whose drawer is open, and whether it was still unresolved then. */
export type HeldDrawer = { id: string; wasUnresolved: boolean } | null;

/**
 * Which tab each issue renders in. A resolved issue sits in Fixed, with two
 * exceptions that keep it in To fix: it is mid exit-fade, or its drawer is
 * open on a row that was unresolved when opened — fixing the last page must
 * not dismiss the drawer under the user, so the move waits for the close.
 */
export function partitionIssues(
  issues: Issue[],
  exitingIds: string[],
  held: HeldDrawer,
) {
  const heldInToFix = (issue: Issue) =>
    held != null && held.id === issue.id && held.wasUnresolved;
  return {
    toFix: issues.filter(
      (issue) =>
        !isResolved(issue) ||
        exitingIds.includes(issue.id) ||
        heldInToFix(issue),
    ),
    fixed: issues.filter(
      (issue) =>
        isResolved(issue) &&
        !exitingIds.includes(issue.id) &&
        !heldInToFix(issue),
    ),
  };
}
