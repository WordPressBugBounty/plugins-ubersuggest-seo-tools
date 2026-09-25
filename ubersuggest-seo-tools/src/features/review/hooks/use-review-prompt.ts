import { useCallback, useEffect, useRef, useState } from 'react';

import { apiPost } from '../../../api';

const ASK_DELAY_MS = 4000;

/** True while focus sits in an editable field, i.e. the drawer's edit mode. */
function isEditingField(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.tagName === 'TEXTAREA' ||
      active.tagName === 'INPUT' ||
      active.isContentEditable)
  );
}

/**
 * Owns the review prompt: schedules the ask after the user's first applied fix
 * and records, server-side, that it was made.
 *
 * The record is written when the modal OPENS, not when the ask is scheduled: a
 * user who leaves wp-admin during the delay never saw it, and is asked again
 * after their next fix rather than losing the one ask we get.
 */
export function useReviewPrompt() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const asked = useRef(false);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const scheduleAsk = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // The modal traps focus and applies are per-ref, so by now the user may be
      // typing into another card. Drop the ask rather than cut them off — it was
      // never recorded, so their next fix asks again.
      if (isEditingField()) {
        asked.current = false;
        return;
      }
      setOpen(true);
      // Swallowed on purpose — a failed record must not break the prompt the
      // user is looking at. Logged because it is the ONLY trace: without it, an
      // expired nonce silently turns into "asked again every session".
      apiPost('review-prompt', {}).catch((error) =>
        console.error('[ubs-seo] recording the review ask failed', error),
      );
    }, ASK_DELAY_MS);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, scheduleAsk, close };
}
