import { useCallback, useMemo, useState } from 'react';

import { withoutKey } from '../lib/records';

/**
 * The set of page refs a flow is currently working on, as the array shape the
 * cards already consume.
 *
 * `track` is the point of the hook: it marks the ref for exactly as long as the
 * work runs, so a flow declares "busy" once instead of clearing the mark on
 * every success, error and give-up path — the way a forgotten clear leaves a
 * card spinning forever.
 *
 * Holds are counted, not boolean. Two overlapping runs on the same page (a
 * click that restarts one already in flight) would otherwise let the first
 * one's cleanup clear the mark the second just set, leaving the card idle while
 * it is still working.
 */
export function useRefSet() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const refs = useMemo(() => Object.keys(counts), [counts]);

  const add = useCallback((ref: string) => {
    setCounts((current) => ({ ...current, [ref]: (current[ref] ?? 0) + 1 }));
  }, []);

  /** Drops one hold; the ref stays marked while another still holds it. */
  const release = useCallback((ref: string) => {
    setCounts((current) => {
      const remaining = (current[ref] ?? 0) - 1;
      return remaining > 0
        ? { ...current, [ref]: remaining }
        : withoutKey(current, ref);
    });
  }, []);

  /** Drops every hold on one ref at once. */
  const remove = useCallback((ref: string) => {
    setCounts((current) => withoutKey(current, ref));
  }, []);

  const clear = useCallback(() => setCounts({}), []);

  const track = useCallback(
    async <Result>(ref: string, work: Promise<Result>): Promise<Result> => {
      add(ref);
      try {
        return await work;
      } finally {
        release(ref);
      }
    },
    [add, release],
  );

  const has = useCallback((ref: string) => ref in counts, [counts]);

  return {
    refs,
    has,
    remove,
    clear,
    track,
  };
}
