import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRefSet } from './use-ref-set';

/** A promise plus the handles to settle it from the test. */
const deferred = <Result>() => {
  let resolve!: (value: Result) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Result>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useRefSet', () => {
  it('marks, unmarks and clears refs', async () => {
    const { result } = renderHook(() => useRefSet());
    const first = deferred<void>();
    const second = deferred<void>();

    act(() => {
      void result.current.track('7', first.promise);
      void result.current.track('9', second.promise);
    });
    await waitFor(() => expect(result.current.refs).toEqual(['7', '9']));
    expect(result.current.has('7')).toBe(true);

    act(() => result.current.remove('7'));
    expect(result.current.refs).toEqual(['9']);
    expect(result.current.has('7')).toBe(false);

    act(() => result.current.clear());
    expect(result.current.refs).toEqual([]);
  });

  it('marks a ref for as long as the work runs', async () => {
    const { result } = renderHook(() => useRefSet());
    const work = deferred<string>();

    let tracked: Promise<string> | undefined;
    act(() => {
      tracked = result.current.track('7', work.promise);
    });

    await waitFor(() => expect(result.current.refs).toEqual(['7']));

    await act(async () => {
      work.resolve('done');
      await tracked;
    });

    expect(result.current.refs).toEqual([]);
    await expect(tracked).resolves.toBe('done');
  });

  it('clears the mark when the work fails, and still reports the failure', async () => {
    const { result } = renderHook(() => useRefSet());
    const work = deferred<string>();

    let tracked: Promise<string> | undefined;
    act(() => {
      tracked = result.current.track('7', work.promise);
    });
    await waitFor(() => expect(result.current.refs).toEqual(['7']));

    await act(async () => {
      work.reject(new Error('boom'));
      await tracked?.catch(() => undefined);
    });

    expect(result.current.refs).toEqual([]);
    await expect(tracked).rejects.toThrow('boom');
  });

  it('stays marked while a restart overlaps the run it replaces', async () => {
    const { result } = renderHook(() => useRefSet());
    const first = deferred<void>();
    const second = deferred<void>();

    let trackedFirst: Promise<void> | undefined;
    act(() => {
      trackedFirst = result.current.track('7', first.promise);
    });
    await waitFor(() => expect(result.current.refs).toEqual(['7']));

    // A second click on the same page, then the first run finishes: the mark
    // belongs to the work still running, not to whichever run started it.
    act(() => void result.current.track('7', second.promise));
    await act(async () => {
      first.resolve();
      await trackedFirst;
    });

    expect(result.current.refs).toEqual(['7']);

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(result.current.refs).toEqual([]);
  });

  it('drops every hold when a ref is explicitly removed', async () => {
    const { result } = renderHook(() => useRefSet());
    const work = deferred<void>();

    act(() => {
      void result.current.track('7', work.promise);
      void result.current.track('7', work.promise);
    });
    await waitFor(() => expect(result.current.refs).toEqual(['7']));

    act(() => result.current.remove('7'));
    expect(result.current.refs).toEqual([]);

    // The two releases still to come must not push the count negative.
    await act(async () => {
      work.resolve();
      await work.promise;
    });
    expect(result.current.refs).toEqual([]);
  });

  it('tracks several refs independently', async () => {
    const { result } = renderHook(() => useRefSet());
    const first = deferred<void>();
    const second = deferred<void>();

    let trackedFirst: Promise<void> | undefined;
    act(() => {
      trackedFirst = result.current.track('7', first.promise);
      void result.current.track('9', second.promise);
    });
    await waitFor(() => expect(result.current.refs).toEqual(['7', '9']));

    await act(async () => {
      first.resolve();
      await trackedFirst;
    });

    expect(result.current.refs).toEqual(['9']);
  });
});
