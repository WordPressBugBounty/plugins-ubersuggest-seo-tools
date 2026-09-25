import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import { useFixPreview } from './use-fix-preview';
import { usePageRecrawl } from './use-page-recrawl';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

// These tests are about the recrawl flow, not analytics — keep tracking inert.
vi.mock('../../../tracking/issues', () => ({ trackIssues: vi.fn() }));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  vi.useRealTimers();
});

/** The recrawl call for a given ref, or undefined if it was never made. */
const recrawlCallFor = (ref: string) =>
  mockApiGet.mock.calls
    .map(([url]) => String(url))
    .find(
      (url) => url.startsWith('page-recrawl') && url.includes(`ref=${ref}`),
    );

describe('per-page recrawl', () => {
  it('starts the crawl without poll=1 and records the verdict it settles on', async () => {
    mockApiGet.mockResolvedValueOnce({ pending: false, verdict: 'fixed' });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));

    await waitFor(() => expect(result.current.verdicts['7']).toBe('fixed'));
    const call = recrawlCallFor('7');
    expect(call).toContain('issue=title_empty');
    expect(call).not.toContain('poll=1');
    expect(result.current.recrawlingRefs).toEqual([]);
  });

  it('polls with poll=1 until the crawl is done, staying busy meanwhile', async () => {
    vi.useFakeTimers();
    mockApiGet
      .mockResolvedValueOnce({ pending: true, crawlCount: 0 })
      .mockResolvedValueOnce({ pending: false, verdict: 'still_flagged' });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));

    // First response is pending: the row stays busy and nothing is decided yet.
    await vi.waitFor(() =>
      expect(result.current.recrawlingRefs).toEqual(['7']),
    );
    expect(result.current.verdicts['7']).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await vi.waitFor(() =>
      expect(result.current.verdicts['7']).toBe('still_flagged'),
    );
    expect(result.current.recrawlingRefs).toEqual([]);
    expect(
      mockApiGet.mock.calls.filter(([url]) => String(url).includes('poll=1')),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it("surfaces 'too_soon' when the backend served the previous report", async () => {
    mockApiGet.mockResolvedValueOnce({ pending: false, verdict: 'too_soon' });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));

    // Never 'fixed': the report predates the fix, so it proves nothing.
    await waitFor(() => expect(result.current.verdicts['7']).toBe('too_soon'));
    expect(result.current.error).toBeNull();
  });

  it("keeps 'unknown' distinct from a clear page so the UI can't imply a fix", async () => {
    mockApiGet.mockResolvedValueOnce({ pending: false, verdict: 'unknown' });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));

    await waitFor(() => expect(result.current.verdicts['7']).toBe('unknown'));
  });

  it('drops the previous verdict when the same page is re-crawled', async () => {
    mockApiGet
      .mockResolvedValueOnce({ pending: false, verdict: 'still_flagged' })
      .mockResolvedValueOnce({ pending: true, crawlCount: 0 });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));
    await waitFor(() =>
      expect(result.current.verdicts['7']).toBe('still_flagged'),
    );

    act(() => result.current.recrawlRow('7'));

    // A stale verdict next to a running crawl would describe the wrong crawl.
    await waitFor(() => expect(result.current.recrawlingRefs).toEqual(['7']));
    expect(result.current.verdicts['7']).toBeUndefined();
  });

  it('surfaces an error and frees the row when the request fails', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.recrawlingRefs).toEqual([]);
    expect(result.current.verdicts['7']).toBeUndefined();
  });

  it('reports a lost account instead of a verdict', async () => {
    mockApiGet.mockResolvedValueOnce({ notConnected: true, expired: true });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.verdicts['7']).toBeUndefined();
    expect(result.current.recrawlingRefs).toEqual([]);
  });

  it('does not cancel a generation in flight on the same page', async () => {
    vi.useFakeTimers();
    // Generation goes pending, then the recrawl is kicked off on the same ref.
    mockApiGet
      .mockResolvedValueOnce({ rows: [], pending: true })
      .mockResolvedValueOnce({ pending: true, crawlCount: 0 });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.generateRow('7'));
    await vi.waitFor(() =>
      expect(result.current.generatingRefs).toEqual(['7']),
    );

    act(() => result.current.recrawlRow('7'));

    // Both operations own the same ref at once; neither timer key evicts the
    // other, so the row is generating AND re-crawling.
    await vi.waitFor(() =>
      expect(result.current.recrawlingRefs).toEqual(['7']),
    );
    expect(result.current.generatingRefs).toEqual(['7']);
    vi.useRealTimers();
  });
});

describe('a crawl abandoned mid-request', () => {
  it('drops the answer of a run that was forgotten while in flight', async () => {
    let settle!: (data: unknown) => void;
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const { result } = renderHook(() => usePageRecrawl('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));
    await waitFor(() => expect(result.current.recrawlingRefs).toEqual(['7']));

    // The user undoes the fix while the crawl request is still out. Its answer
    // describes the page BEFORE the undo, so it must not land.
    act(() => result.current.forgetRow('7'));
    await act(async () => {
      settle({ pending: false, verdict: 'fixed' });
      await Promise.resolve();
    });

    expect(result.current.verdicts['7']).toBeUndefined();
    expect(result.current.recrawlingRefs).toEqual([]);
  });

  it('drops the answer of a run replaced by a newer crawl of the same page', async () => {
    let settleFirst!: (data: unknown) => void;
    mockApiGet
      .mockReturnValueOnce(
        new Promise((resolve) => {
          settleFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({ pending: false, verdict: 'still_flagged' });

    const { result } = renderHook(() => usePageRecrawl('title_empty', vi.fn()));
    act(() => result.current.recrawlRow('7'));
    act(() => result.current.recrawlRow('7'));

    await waitFor(() =>
      expect(result.current.verdicts['7']).toBe('still_flagged'),
    );

    await act(async () => {
      settleFirst({ pending: false, verdict: 'fixed' });
      await Promise.resolve();
    });

    // The stale run must not overwrite what the live one settled on.
    expect(result.current.verdicts['7']).toBe('still_flagged');
  });
});
