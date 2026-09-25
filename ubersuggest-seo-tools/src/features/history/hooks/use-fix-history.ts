import { useCallback, useEffect, useRef, useState } from 'react';

import { useDebounce } from '../../../hooks/use-debounce';
import {
  type ClientRefusal,
  fetchHistory,
  type HistoryResponse,
  type RevertRefusal,
  revertFix,
} from '../services/fix-history';

/** One request per settled pause instead of one per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

/** A refused Undo, so the row can say why the click did not take. */
export type RevertFailure = { id: number; code: RevertRefusal | ClientRefusal };

/**
 * The History tab's data and its filters. The setters reset to page 1
 * themselves, so a filter change is one fetch, not two.
 */
export function useFixHistory() {
  const [issue, setIssue] = useState('');
  const [pageRef, setPageRef] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Only the search waits; a filter or page click cannot repeat per keystroke.
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [revertFailure, setRevertFailure] = useState<RevertFailure | null>(
    null,
  );
  // A response is valid while it still describes the query on screen. Compared
  // by query and not by a request counter: a keystroke undone inside the
  // debounce window settles back on the query already in flight, and a counter
  // would abandon that request with no replacement ever firing — the table
  // stuck on its spinner until a page reload.
  const queryKey = `${issue}\u0000${pageRef}\u0000${debouncedSearch}\u0000${page}`;
  const currentQuery = useRef(queryKey);

  const load = useCallback(() => {
    return fetchHistory({ issue, ref: pageRef, search: debouncedSearch, page })
      .then((response) => {
        if (currentQuery.current !== queryKey) return;
        setData(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (currentQuery.current !== queryKey) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, [issue, pageRef, debouncedSearch, page, queryKey]);

  useEffect(() => {
    currentQuery.current = queryKey;
    // A new list: a failure pinned to a row of the old one would keep that
    // row's Undo hidden behind a reason that stopped applying.
    setRevertFailure(null);
    void load();
  }, [load, queryKey]);

  /**
   * Undo one record, then reload either way: on success the revert appends its
   * own record, and on refusal the reloaded row carries the fresh
   * `revertRefusal` so the button stops offering a click that fails.
   */
  const revert = useCallback(
    async (id: number) => {
      setRevertingId(id);
      setRevertFailure(null);
      try {
        const result = await revertFix(id);
        if (!result.ok) {
          setRevertFailure({ id, code: result.code });
        }
        await load();
      } catch (cause: unknown) {
        console.error('[ubs-seo] undo failed', cause);
        setRevertFailure({ id, code: 'request_failed' });
      } finally {
        setRevertingId(null);
      }
    },
    [load],
  );

  return {
    records: data?.records ?? null,
    total: data?.total ?? 0,
    perPage: data?.perPage ?? 25,
    issueTypes: data?.issueTypes ?? [],
    error,
    issue,
    pageRef,
    search,
    page,
    setIssue: useCallback((value: string) => {
      setIssue(value);
      setPage(1);
    }, []),
    setPageRef: useCallback((value: string) => {
      setPageRef(value);
      setPage(1);
    }, []),
    setSearch: useCallback((value: string) => {
      setSearch(value);
      setPage(1);
    }, []),
    setPage,
    revert,
    revertingId,
    revertFailure,
  };
}
