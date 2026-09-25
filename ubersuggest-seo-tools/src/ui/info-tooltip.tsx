import {
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TranslationKeys,
} from '@ui';

import { HelpCircleIcon } from '../icons';
import { DRAWER_Z_INDEX } from './side-drawer';

/**
 * The (i) that explains a metric — the plugin's one tooltip affordance, modelled
 * on the dashboard's TooltipQuestionMark.
 *
 * It replaces the native `title` attribute we used before, which the browser
 * styles on its own terms, delays by a second or so, and never shows on a touch
 * device. The DS tooltip handles all three, including coarse pointers: it opens
 * on tap and closes on the next tap, so the text isn't desktop-only.
 */
export function InfoTooltip({ hint }: { hint: TranslationKeys }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // The (i) explains its label; the label is the accessible name that
          // matters, so this button just needs to be reachable, not narrated.
          tabIndex={-1}
          className="flex cursor-help items-center text-black/30 transition-colors hover:text-black"
        >
          <HelpCircleIcon size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        // Dark, not the DS default light: tooltips read as white-on-black here.
        // The theme also carries the arrow, so it can't drift from the bubble.
        theme="dark"
        // Above the drawer: cards live inside it too, and the DS ships `z-60`
        // on this element, which the drawer's stacking level would bury. Same
        // fix as the issue explainer — inline, so it can't lose to the class.
        style={{ zIndex: DRAWER_Z_INDEX + 1 }}
        className="max-w-3xs text-wrap px-2 py-3"
      >
        <Text size="xs" className="text-white" text={hint} />
      </TooltipContent>
    </Tooltip>
  );
}
