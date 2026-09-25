import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Right-side drawer. We roll our own instead of the DS Drawer because the DS's
// Headless UI dialog mis-detects "click outside" when the app runs inside our
// iframe — its main-tree/portal heuristic (use-root-containers) picks the wrong
// `body > *` as the app root, so it treats clicks on the panel as outside and
// closes on every click. This gives explicit, reliable handling: the backdrop
// closes, the panel stops propagation.
const TRANSITION_MS = 300;

/**
 * The drawer's stacking level. Must stay in sync with the `z-[100000]` class on
 * the panel below — Tailwind can't see a class built from this constant, so the
 * literal has to live in the markup. Exported for overlays that open FROM
 * inside the drawer and therefore have to stack above it: the DS Popover
 * defaults to `z-60`, which would put it behind the panel.
 */
export const DRAWER_Z_INDEX = 100000;

export function SideDrawer({
  open,
  onClose,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  // `mounted` keeps the drawer in the DOM through the exit animation; `entered`
  // drives the slide/fade (off-screen → in on open, and back out on close).
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Wait a frame so the browser paints the off-screen state first, then the
      // change to the on-screen state actually transitions.
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    const timer = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100000]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-black/40 transition-opacity duration-300 ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full max-w-[720px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-zinc-200 border-b p-6">
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {footer && (
          <div className="border-zinc-200 border-t px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
