import { Text } from '@ui';
import type { ReactNode } from 'react';

import { SparklesIcon } from '../../../../icons';

// Inline rather than a Tailwind arbitrary value: a multi-stop gradient in a
// class name is unreadable and Tailwind has to keep the whole string intact
// anyway. Same two stops the dashboard's code-fix modal uses.
const SUGGESTION_GRADIENT =
  'linear-gradient(174deg, rgb(239,246,255) 0%, rgb(250,245,255) 100%)';

/**
 * The blue "AI Suggestion" panel from the dashboard's code-fix modal, ported so
 * a suggestion reads the same here as it does there. Wraps whatever the card's
 * suggestion area is showing — the pending spinner as well as the suggestion
 * itself — so the box doesn't pop into existence when generation finishes.
 */
export function SuggestionPanel({
  children,
  headerRight,
}: {
  children: ReactNode;
  /** Right side of the panel header — the character counter, in practice. */
  headerRight?: ReactNode;
}) {
  return (
    <div
      className="mt-2 rounded-xl border border-blue-600 p-4"
      style={{ background: SUGGESTION_GRADIENT }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SparklesIcon size={18} className="shrink-0 text-blue-600" />
          <Text
            size="sm"
            weight="medium"
            className="text-blue-600"
            text="ai_suggestion"
          />
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}
