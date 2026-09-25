import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDebounce } from './use-debounce';

describe('useDebounce', () => {
  it('starts settled, so the first render needs no wait', () => {
    const { result } = renderHook(() => useDebounce('initial', 50));

    expect(result.current).toBe('initial');
  });

  it('holds the old value until the changes stop', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 50),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    rerender({ value: 'abc' });
    expect(result.current).toBe('a');

    await waitFor(() => expect(result.current).toBe('abc'));
  });

  /** Each change cancels the pending timer, so only the last value lands. */
  it('never settles on a value that was typed over', async () => {
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ value }) => {
        const settled = useDebounce(value, 30);
        if (seen[seen.length - 1] !== settled) seen.push(settled);
        return settled;
      },
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    rerender({ value: 'abc' });

    await waitFor(() => expect(result.current).toBe('abc'));
    expect(seen).toEqual(['a', 'abc']);
  });
});
