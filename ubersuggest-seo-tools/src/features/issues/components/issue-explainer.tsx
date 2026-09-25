import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
  translate,
} from '@ui';
import { useRef, useState } from 'react';

import { useMediaQuery } from '../../../hooks/use-media-query';
import { dynamicKey } from '../../../i18n/translate-dynamic';
import { CloseIcon } from '../../../icons';
import { DRAWER_Z_INDEX } from '../../../ui/side-drawer';
import { issueArticleUrls } from '../issue-articles';

// Long enough to move the cursor from the trigger into the panel without it
// closing underneath, short enough not to feel sticky. Same value as the app.
const HOVER_CLOSE_DELAY_MS = 120;

/**
 * The article links a text interpolates at its `{0}` placeholder. Elements as
 * translation values only survive the adapter's rich path — see
 * src/i18n/configure-design-system.tsx.
 */
function articleLinks(issueId: string, type: 'what' | 'how') {
  return issueArticleUrls(issueId, type).map((url) => (
    <Text
      as="a"
      key={url}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-orange-600 underline hover:text-orange-700"
      text="issue_article_link"
    />
  ));
}

/**
 * "What is this and how do I fix it?" — the explainer the Ubersuggest dashboard
 * puts on every Site Audit issue row, ported 1:1.
 *
 * It exists because an issue we can't fix here would otherwise dead-end: the
 * drawer lists affected pages (or nothing at all, for the site-wide checks that
 * have no per-page breakdown) with no word on what to actually do.
 *
 * Opens on hover where hovering is meaningful and on click everywhere else — a
 * touch device reports no reliable hover, and a hover-only trigger would be
 * unreachable there.
 */
export function IssueExplainer({
  issueId,
  resolved = false,
}: {
  issueId: string;
  /** A resolved issue gets "Learn more" instead of the fix-it framing. */
  resolved?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openOnHover = () => {
    if (!canHover) return;
    clearCloseTimer();
    setIsOpen(true);
  };

  const closeOnHover = () => {
    if (!canHover) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(
      () => setIsOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="link"
          // The row itself opens the drawer; this trigger must not.
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={openOnHover}
          onMouseLeave={closeOnHover}
          className="text-orange-600 text-sm underline underline-offset-2 hover:text-orange-700"
        >
          <Text
            size="sm"
            className="text-orange-600"
            text={resolved ? 'issue_learn_more' : 'issue_what_is_this_and_how'}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={16}
        // Above the drawer, since the drawer's own header hosts one of these.
        // Inline rather than a class: the DS ships `z-60` on this element, and
        // two z-index utilities on one element resolve by stylesheet order, not
        // by which class we list last. Radix copies the content's COMPUTED
        // z-index onto its positioner wrapper, so this lifts the whole popover.
        style={{ zIndex: DRAWER_Z_INDEX + 1 }}
        // Opened by hover, so stealing focus would trap the keyboard here.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={openOnHover}
        onMouseLeave={closeOnHover}
        className="max-h-(--radix-popover-content-available-height) w-[620px] max-w-[90vw] overflow-y-auto p-6 shadow-xl"
      >
        <Button
          variant="neutral-solid"
          onClick={() => setIsOpen(false)}
          aria-label={translate('issue_explainer_close')}
          className="absolute top-4 right-4 border-none text-zinc-500 transition-colors hover:bg-transparent hover:text-zinc-900"
        >
          <CloseIcon size={18} />
        </Button>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Text
              size="base"
              weight="bold"
              className="text-orange-600 uppercase tracking-wide"
              text="issue_what_is_this"
            />
            <Text
              size="sm"
              className="whitespace-pre-line text-zinc-700"
              text={dynamicKey(`issue_what_${issueId}`)}
              translationConfig={{
                translationVariables: articleLinks(issueId, 'what'),
                boldClassName: 'font-semibold text-orange-600',
              }}
            />
          </div>
          <div className="flex flex-col gap-3">
            <Text
              size="base"
              weight="bold"
              className="text-orange-600 uppercase tracking-wide"
              text="issue_how_do_i_fix_it"
            />
            <Text
              size="sm"
              className="whitespace-pre-line text-zinc-700"
              text={dynamicKey(`issue_how_${issueId}`)}
              translationConfig={{
                translationVariables: articleLinks(issueId, 'how'),
                boldClassName: 'font-semibold text-orange-600',
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
