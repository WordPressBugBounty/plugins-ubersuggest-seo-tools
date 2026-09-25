import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import { useSiteAudit } from './use-site-audit';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

/** A crawl the backend reports as still running. */
const PENDING = { pending: true, crawlCount: 7 };
/** The finished report the cancel route answers with. */
const REPORT = { domain: 'exemplo.com', lastCrawl: 'May 1, 2026 10:00 AM' };

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiGet.mockResolvedValue(PENDING);
});

/** Mount the hook and wait until it is showing a crawl in progress. */
async function crawling() {
  const { result } = renderHook(() => useSiteAudit());
  await waitFor(() => expect(result.current.progress).not.toBeNull());
  return result;
}

describe('useSiteAudit, cancelling a crawl', () => {
  it('swaps the running crawl for the report the cancel answers with', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue(REPORT);

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.audit).toEqual(REPORT));
    expect(result.current.progress).toBeNull();
    expect(result.current.cancelling).toBe(false);
  });

  /**
   * The route stops the crawl and reads the report back in one call. A GET
   * after the POST would be the bug this replaced: on a site with nothing
   * stored, that read starts a crawl and undoes the cancel.
   */
  it('does not re-read the audit after cancelling', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue(REPORT);
    const readsBefore = mockApiGet.mock.calls.length;

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.audit).not.toBeNull());
    expect(mockApiPost).toHaveBeenCalledWith('audit/cancel', {});
    expect(mockApiGet.mock.calls.length).toBe(readsBefore);
  });

  /** Nothing was ever crawled, so the page offers a new crawl instead. */
  it('reports noReport when there is nothing to fall back to', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue({ stopped: true, noReport: true });

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.noReport).toBe(true));
    expect(result.current.progress).toBeNull();
    expect(result.current.audit).toBeNull();
    expect(result.current.error).toBeNull();
  });

  /**
   * A failed stop leaves the crawl running, so the error screen would be a
   * lie: the hook says the cancel failed and keeps following the crawl.
   *
   * This is the shape the server actually produces — a WP_Error from the stop
   * arrives as HTTP 200 {stopFailed:true}, which apiPost RESOLVES. A test that
   * only rejects the promise would pass with the hook routing this through the
   * generic {error} branch, wiping the progress screen (it did).
   */
  it('keeps showing the crawl when the backend could not stop it', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue({ stopFailed: true });

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.cancelFailed).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.progress).not.toBeNull();
    expect(result.current.cancelling).toBe(false);
  });

  /** The POST itself failing in transit means the same thing. */
  it('keeps showing the crawl when the stop request never lands', async () => {
    const result = await crawling();
    mockApiPost.mockRejectedValue(new Error('sem rede'));

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.cancelFailed).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.progress).not.toBeNull();
  });

  /** A dead account is the connect prompt, never a raw error string. */
  it('surfaces a connect prompt returned by the cancel route', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue({
      notConnected: true,
      expired: true,
      connectUrl: 'https://example.test/connect',
    });

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.connectPrompt).not.toBeNull());
    expect(result.current.connectPrompt?.expired).toBe(true);
    expect(result.current.progress).toBeNull();
  });

  /**
   * The crawl stopped but the report read after it failed. The cancelled
   * screen (with its start-a-new-crawl action) is the truthful landing spot —
   * an error would read as the cancel failing while the crawl is already gone.
   */
  it('lands on the cancelled screen when the report read fails after a stop', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue({ stopped: true, reportUnavailable: true });

    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.noReport).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
  });

  /**
   * The race the timer-clearing alone cannot close: a poll REQUEST already in
   * flight when Cancel is clicked. Its late reply used to re-enable the button
   * mid-cancel, flip the screen back to progress, and re-arm the loop — whose
   * next poll=1, on a site with no stored report, starts a fresh crawl: the
   * user cancels, and the plugin quietly relaunches and charges a crawl.
   */
  it('discards a poll that was in flight when the crawl was cancelled', async () => {
    vi.useFakeTimers();
    try {
      let resolveStalePoll: (value: unknown) => void = () => {};
      mockApiGet
        .mockResolvedValueOnce(PENDING) // the mount's read
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveStalePoll = resolve;
            }),
        );
      mockApiPost.mockResolvedValue({ stopped: true, noReport: true });

      const { result } = renderHook(() => useSiteAudit());
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.progress).not.toBeNull();

      // The poll loop fires its next read; it is now in flight, unanswered.
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(mockApiGet).toHaveBeenCalledTimes(2);

      await act(async () => {
        result.current.cancel();
        await Promise.resolve();
      });
      expect(result.current.noReport).toBe(true);

      // Only now does the stale poll answer, claiming the crawl still runs.
      await act(async () => {
        resolveStalePoll(PENDING);
        await Promise.resolve();
      });

      expect(result.current.noReport).toBe(true);
      expect(result.current.progress).toBeNull();
      expect(result.current.cancelling).toBe(false);

      // And it armed no timer: nothing polls again, nothing can re-trigger.
      const reads = mockApiGet.mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(60000);
        await Promise.resolve();
      });
      expect(mockApiGet.mock.calls.length).toBe(reads);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A failed stop re-arms the poll loop four seconds out, and that poll used to
   * run the same state reset every call does — clearing the only sign the stop
   * failed, and silently re-enabling the button, while nothing had changed.
   */
  it('keeps the failed-stop message up when the poll loop resumes', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSiteAudit());
      await act(async () => {
        await Promise.resolve();
      });
      mockApiPost.mockResolvedValue({ stopFailed: true });
      await act(async () => {
        result.current.cancel();
        await Promise.resolve();
      });
      expect(result.current.cancelFailed).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(result.current.cancelFailed).toBe(true);
      expect(result.current.progress).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /** Trying to stop it again is what takes the message down. */
  it('clears the failed-stop message on a fresh attempt', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValueOnce({ stopFailed: true });
    await act(async () => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.cancelFailed).toBe(true));

    mockApiPost.mockResolvedValueOnce(REPORT);
    await act(async () => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.cancelFailed).toBe(false));
    expect(result.current.audit).toEqual(REPORT);
  });

  /**
   * A failed stop hands the SAME crawl back to the poll loop, so the attempt
   * counter must survive it: `polls.current > 0` is what marks a fetch failure
   * as a mid-crawl blip. Zeroing it here sent one transient failure straight to
   * the error screen — with the crawl still running behind it.
   */
  it('keeps the mid-crawl retry budget after a failed stop', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSiteAudit());
      await act(async () => {
        await Promise.resolve();
      });
      mockApiPost.mockResolvedValue({ stopFailed: true });
      await act(async () => {
        result.current.cancel();
        await Promise.resolve();
      });

      mockApiGet.mockRejectedValueOnce(new Error('sem rede'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.progress).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /** Starting a crawl again clears the cancelled state the page renders on. */
  it('clears noReport when a new crawl is started', async () => {
    const result = await crawling();
    mockApiPost.mockResolvedValue({ stopped: true, noReport: true });
    await act(async () => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.noReport).toBe(true));

    mockApiGet.mockResolvedValue(REPORT);
    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.noReport).toBe(false));
    expect(mockApiGet).toHaveBeenLastCalledWith('audit');
  });
});
