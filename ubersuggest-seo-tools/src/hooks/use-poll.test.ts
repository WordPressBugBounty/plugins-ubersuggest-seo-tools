import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePoll } from './use-poll';

const CONFIG = { intervalMs: 1000, maxAttempts: 3 };

/** Resolves `true` (keep polling) the given number of times, then `false`. */
const pendingTimes = (times: number) => {
  let remaining = times;
  return vi.fn(async () => remaining-- > 0);
};

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePoll', () => {
  it('waits an interval before the first attempt by default', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = pendingTimes(0);

    act(() => void result.current.start('a', attempt));
    expect(attempt).not.toHaveBeenCalled();

    await advance(1000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('runs the first attempt right away when asked', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = pendingTimes(0);

    await act(async () => {
      void result.current.start('a', attempt, { immediate: true });
    });

    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('keeps asking while the attempt stays pending and settles when it stops', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = pendingTimes(2);
    let settled = false;

    act(() => {
      void result.current.start('a', attempt).then(() => {
        settled = true;
      });
    });

    await advance(1000);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    await advance(2000);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(settled).toBe(true);
  });

  it('never runs the attempt more than maxAttempts times', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    // Never settles on its own: only the budget can end this chain.
    const attempt = vi.fn(async () => true);
    const onExhausted = vi.fn();

    act(() => void result.current.start('a', attempt, { onExhausted }));
    await advance(60_000);

    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it('counts an immediate attempt against the budget', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = vi.fn(async () => true);

    await act(async () => {
      void result.current.start('a', attempt, { immediate: true });
    });
    await advance(60_000);

    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('polls each key on its own timer and budget', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const first = pendingTimes(0);
    const second = vi.fn(async () => true);

    act(() => {
      void result.current.start('a', first);
      void result.current.start('b', second);
    });

    await advance(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // 'a' settled on its first answer; 'b' spends its whole budget.
    await advance(60_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(3);
  });

  it('stops a chain and settles its promise', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = vi.fn(async () => true);
    let settled = false;

    act(() => {
      void result.current.start('a', attempt).then(() => {
        settled = true;
      });
    });
    await advance(1000);
    expect(attempt).toHaveBeenCalledTimes(1);

    act(() => result.current.stop('a'));
    await act(async () => {});
    expect(settled).toBe(true);

    await advance(60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('stops every chain at once', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);

    act(() => {
      void result.current.start('a', first);
      void result.current.start('b', second);
    });
    await advance(1000);

    act(() => result.current.stopAll());
    await advance(60_000);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected attempt and ends the chain', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = vi.fn(async () => {
      throw new Error('network down');
    });
    const onError = vi.fn();
    let settled = false;

    act(() => {
      void result.current.start('a', attempt, { onError }).then(() => {
        settled = true;
      });
    });
    await advance(1000);

    expect(onError).toHaveBeenCalledWith(new Error('network down'));
    expect(settled).toBe(true);
    await advance(60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('lets a restart replace a running chain instead of racing it', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);

    act(() => void result.current.start('a', first));
    await advance(1000);
    expect(first).toHaveBeenCalledTimes(1);

    act(() => void result.current.start('a', second));
    await advance(3000);

    // The replaced chain is silent from here; only the new one runs.
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(3);
  });

  it('settles the chain even when onExhausted throws', async () => {
    const { result } = renderHook(() => usePoll(CONFIG));
    const attempt = vi.fn(async () => true);
    let settled = false;

    act(() => {
      void result.current
        .start('a', attempt, {
          onExhausted: () => {
            throw new Error('missing translation');
          },
        })
        .then(() => {
          settled = true;
        });
    });
    await advance(60_000);

    expect(settled).toBe(true);
  });

  it('drops pending timers when the component unmounts', async () => {
    const { result, unmount } = renderHook(() => usePoll(CONFIG));
    const attempt = vi.fn(async () => true);

    act(() => void result.current.start('a', attempt));
    await advance(1000);

    unmount();
    await advance(60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
