/**
 * Adapter over the real @ubersuggest/ui design system.
 *
 * App code imports its UI from '@ui' (aliased to this file in vite.config.ts +
 * tsconfig.json). Here we re-export the real DS and smooth the few API gaps so
 * the screens stay unchanged:
 *   - Text defaults to an inline <span> (the DS default element is <p>).
 *
 * The real package is imported by its bare name here — '@ubersuggest/ui' is NOT
 * aliased (only '@ui' is), so this resolves to node_modules, no import loop.
 */
import { Text as DesignSystemText } from '@ubersuggest/ui';
import { createElement, type ElementType } from 'react';

export type {
  SelectOption,
  SupportedLanguage,
  TranslationKeys,
} from '@ubersuggest/ui';
export {
  Button,
  cn,
  DesignSystemProvider,
  Drawer,
  Heading,
  Input,
  LoadingSpinner,
  ModalDialog,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  setLanguage,
  Tabs,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  translate,
} from '@ubersuggest/ui';

/**
 * The DS Text props, verbatim. Taking them from the component (rather than
 * Omit-ing over them) preserves the discriminated union: a caller passes EITHER
 * `children` OR `text` (a translation key), never both — and with the key union
 * augmented in src/i18n/translation-keys.d.ts, `text` autocompletes our catalog
 * and a typo fails to compile. An Omit here would flatten the union and widen
 * `text` back to plain string, silently losing both guarantees.
 */
type TextProps<T extends ElementType = 'span'> = Parameters<
  typeof DesignSystemText<T>
>[0];

/** DS Text rendered as an inline <span> to match our existing layout. */
export function Text<T extends ElementType = 'span'>(props: TextProps<T>) {
  // `as` is spread last so a caller can still override the span default.
  return createElement(DesignSystemText, { as: 'span', ...props } as never);
}
