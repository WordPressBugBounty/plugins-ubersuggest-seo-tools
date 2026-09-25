import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy text to the clipboard and flag `copied` for `timeout` ms, mirroring
 * ubersuggest-next's shared/hooks/use-clipboard.
 *
 * No fallback and no error state: `navigator.clipboard` is [SecureContext], so
 * it's absent on a plain-HTTP wp-admin and writeText can still reject — but a
 * failed copy simply doesn't confirm. That's the one invariant kept here: the
 * flag is set only AFTER the write resolves, so the button can never claim a
 * copy that didn't happen.
 */
export function useClipboard(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // A copy right before unmount would otherwise leave a timer to fire on a
  // gone component.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      try {
        await clipboard.writeText(text);
      } catch {
        return;
      }
      setCopied(true);
      // Re-clicking mid-confirmation restarts the window instead of having the
      // first timer cut the second confirmation short.
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );

  return { copied, copy };
}
