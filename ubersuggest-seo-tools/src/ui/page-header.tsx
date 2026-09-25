import { Heading, type TranslationKeys } from '@ui';
import type { ReactNode } from 'react';

import { InfoTooltip } from './info-tooltip';

/**
 * Every page starts the same way: the page title, an optional (i) explaining
 * what the page is for, and — directly under it — the page's tabs.
 *
 * Ported from AI Search Visibility, which is the pattern the app standardised
 * on (see its PageTabs: title row, then the DS Tabs in one `gap-4 sm:gap-6`
 * column). Owning it here is what keeps the three pages from drifting: before
 * this, Issues had a title with a hand-rolled tooltip, Settings had a bare
 * title, and Site Audit had no header at all.
 */
export function PageHeader({
  title,
  hint,
  tabs,
}: {
  title: TranslationKeys;
  /** Omit when the title says everything — no hint, no (i). */
  hint?: TranslationKeys;
  /** The page's DS Tabs, if it has any. Sits directly below the title. */
  tabs?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Level 6 is the DS's `text-base/6 font-medium`, which with `subtle`
          reproduces the dashboard's title row exactly (base / medium /
          zinc-600). `as="h1"` keeps it the page's real heading — the size is a
          visual choice, not a demotion in the document outline. */}
      <div className="flex items-center gap-2">
        <Heading as="h1" level={6} color="subtle" text={title} />
        {hint !== undefined && <InfoTooltip hint={hint} />}
      </div>
      {tabs}
    </div>
  );
}
