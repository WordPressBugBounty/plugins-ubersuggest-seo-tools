import { useEffect, useState } from 'react';

/**
 * A value that only settles once it has stopped changing for `delay`.
 *
 * The delay is on the VALUE, not on the work reading it, so a caller debounces
 * the one input that changes per keystroke and leaves filters, pagination and
 * the first render firing immediately.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
