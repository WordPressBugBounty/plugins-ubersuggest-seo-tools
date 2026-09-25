import { Text, type TranslationKeys } from '@ui';
import type { ReactNode } from 'react';

import { ArrowRightIcon } from '../icons';
import { InfoTooltip } from './info-tooltip';

// Shared card shell: the rounded white panel used across Site Audit, SEO Issues
// and Settings. Previously copy-pasted as a local `CARD` constant in each page.
export const CARD = 'rounded-2xl border border-zinc-200 bg-white';

/**
 * Uppercase muted label, plus an (i) tooltip when there's something to explain.
 * Mirrors the design system's contract: pass a translation KEY (`text`) and it
 * translates, or pass `children` for content we compose ourselves. `hint` is a
 * key as well, handed to the tooltip.
 *
 * No `hint`, no icon: the (i) used to render unconditionally, so a label with
 * nothing to say still showed one — and hovering it did nothing.
 */
type CardLabelProps = { hint?: TranslationKeys } & (
  | { text: TranslationKeys; children?: never }
  | { children: ReactNode; text?: never }
);

export function CardLabel({ children, text, hint }: CardLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      {text === undefined ? (
        <Text size="xs" color="muted" className="uppercase tracking-wide">
          {children}
        </Text>
      ) : (
        <Text
          size="xs"
          color="muted"
          className="uppercase tracking-wide"
          text={text}
        />
      )}
      {hint !== undefined && <InfoTooltip hint={hint} />}
    </div>
  );
}

type CardFooterLinkProps = { onClick?: () => void } & (
  | { text: TranslationKeys; children?: never }
  | { children: ReactNode; text?: never }
);

export function CardFooterLink({
  children,
  text,
  onClick,
}: CardFooterLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 border-zinc-100 border-t p-4 px-6 text-left transition-colors hover:bg-zinc-50"
    >
      {text === undefined ? (
        <Text size="sm" weight="semibold">
          {children}
        </Text>
      ) : (
        <Text size="sm" weight="semibold" text={text} />
      )}
      <ArrowRightIcon size={16} className="text-orange-600" />
    </button>
  );
}
