import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import type { HistoryRecord } from '../services/fix-history';
import { useFixHistory } from './use-fix-history';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

const makeRecord = (over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  id: 1,
  action: 'apply',
  issueId: 'title_long',
  ref: '25',
  field: 'title',
  pageTitle: 'Pricing',
  pageUrl: 'https://example.com/pricing/',
  pageExists: true,
  before: 'Old title',
  after: 'New title',
  restores: true,
  stale: false,
  source: 'ai',
  integration: 'native',
  user: 'admin',
  appliedAt: '2026-09-04T14:20:33+00:00',
  appliedAtSite: '2026-09-04 11:20:33',
  revertRefusal: null,
  ...over,
});

const respondWith = (records: HistoryRecord[], total = records.length) => ({
  records,
  total,
  perPage: 25,
  issueTypes: ['title_long'],
});

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiGet.mockResolvedValue(respondWith([makeRecord()]));
});

describe('useFixHistory', () => {
  it('loads the first page and reports what the endpoint sent', async () => {
    const { result } = renderHook(() => useFixHistory());

    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(mockApiGet).toHaveBeenCalledWith('history');
    expect(result.current.issueTypes).toEqual(['title_long']);
  });

  it('sends the filters as query params', async () => {
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    act(() => result.current.setSearch('pricing'));
    act(() => result.current.setIssue('title_long'));

    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        'history?issue=title_long&search=pricing',
      ),
    );
  });

  /**
   * A filter change while on page 3 must not ask for page 3 of the narrower
   * result — that is how a filter lands the user on an empty page.
   */
  it('returns to the first page when a filter changes', async () => {
    mockApiGet.mockResolvedValue(respondWith([makeRecord()], 60));
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    act(() => result.current.setPage(3));
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith('history?page=3'),
    );

    act(() => result.current.setIssue('title_long'));

    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith('history?issue=title_long'),
    );
    expect(result.current.page).toBe(1);
  });

  it('reloads after an undo, so the new revert record shows up', async () => {
    mockApiPost.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());
    const loadsBeforeUndo = mockApiGet.mock.calls.length;

    await act(() => result.current.revert(1));

    expect(mockApiPost).toHaveBeenCalledWith('history/revert', { id: 1 });
    expect(mockApiGet.mock.calls.length).toBeGreaterThan(loadsBeforeUndo);
    expect(result.current.revertFailure).toBeNull();
  });

  /** A refused undo names the row and the reason, and still reloads. */
  it('keeps a refused undo on its own row', async () => {
    mockApiPost.mockResolvedValue({ ok: false, code: 'value_changed' });
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    await act(() => result.current.revert(1));

    expect(result.current.revertFailure).toEqual({
      id: 1,
      code: 'value_changed',
    });
    expect(result.current.revertingId).toBeNull();
  });

  it('surfaces a failed load instead of showing an empty log', async () => {
    mockApiGet.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useFixHistory());

    await waitFor(() => expect(result.current.error).toBe('Network down'));
    expect(result.current.records).toBeNull();
  });

  /** Not a refusal, so it gets its own code and the row keeps the retry. */
  it('separates a failed request from a refusal', async () => {
    mockApiPost.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    await act(() => result.current.revert(1));

    expect(result.current.revertFailure).toEqual({
      id: 1,
      code: 'request_failed',
    });
  });

  /**
   * A new query is a new list, so keeping the failure would hide that row's
   * Undo behind a reason that stopped applying, until a page reload.
   */
  it('drops a revert failure once the query changes', async () => {
    mockApiPost.mockResolvedValue({ ok: false, code: 'value_changed' });
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());
    await act(() => result.current.revert(1));
    expect(result.current.revertFailure).not.toBeNull();

    act(() => result.current.setSearch('outra busca'));

    await waitFor(() => expect(result.current.revertFailure).toBeNull());
  });

  /** But the reason survives the reload the undo itself triggers. */
  it('keeps the refusal through its own reload', async () => {
    mockApiPost.mockResolvedValue({ ok: false, code: 'value_changed' });
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    await act(() => result.current.revert(1));

    expect(result.current.revertFailure).toEqual({
      id: 1,
      code: 'value_changed',
    });
  });

  /** Delaying a click that cannot repeat made it look dropped. */
  it('fetches a filter change immediately and a search after it settles', async () => {
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    act(() => result.current.setIssue('title_long'));
    expect(mockApiGet).toHaveBeenLastCalledWith('history?issue=title_long');

    act(() => result.current.setSearch('pricing'));
    expect(mockApiGet).toHaveBeenLastCalledWith('history?issue=title_long');
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        'history?issue=title_long&search=pricing',
      ),
    );
  });

  /**
   * A response is stale once the query it was made for has been replaced by one
   * that already fired. The window before that — the box cleared, the empty
   * query still settling — deliberately lets the pending answer land: it paints
   * the rows already on screen and the replacement corrects it.
   */
  it('ignores a response whose query has already been replaced', async () => {
    let resolveAbandoned: (value: unknown) => void = () => {};
    mockApiGet.mockImplementation((path: string) =>
      path.includes('search=pric')
        ? new Promise((resolve) => {
            resolveAbandoned = resolve;
          })
        : Promise.resolve(respondWith([makeRecord({ pageTitle: 'Current' })])),
    );
    const { result } = renderHook(() => useFixHistory());
    await waitFor(() => expect(result.current.records).not.toBeNull());

    act(() => result.current.setSearch('pric'));
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith('history?search=pric'),
    );

    act(() => result.current.setSearch(''));
    await waitFor(() => expect(mockApiGet).toHaveBeenLastCalledWith('history'));

    await act(async () => {
      resolveAbandoned(respondWith([makeRecord({ pageTitle: 'Abandoned' })]));
    });

    expect(result.current.records?.[0].pageTitle).toBe('Current');
  });

  /**
   * A keystroke undone inside the debounce window settles back on the query
   * already in flight, so that request is still the right answer. Invalidating
   * it by counting requests instead stranded the table on its spinner: nothing
   * changed, so nothing re-fired.
   */
  it('keeps the in-flight request when a keystroke is undone', async () => {
    let resolveMount: (value: unknown) => void = () => {};
    mockApiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMount = resolve;
        }),
    );
    const { result } = renderHook(() => useFixHistory());

    act(() => result.current.setSearch('p'));
    act(() => result.current.setSearch(''));
    await act(async () => {
      resolveMount(respondWith([makeRecord({ pageTitle: 'Current' })]));
    });

    expect(result.current.records?.[0].pageTitle).toBe('Current');
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});
