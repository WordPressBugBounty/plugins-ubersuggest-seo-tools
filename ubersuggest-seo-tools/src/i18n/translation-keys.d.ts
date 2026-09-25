/**
 * Type the DS's `text` prop with OUR catalog keys.
 *
 * @ubersuggest/ui declares an empty TranslationKeysMap and derives
 * `TranslationKeys = keyof TranslationKeysMap extends never ? string : …` — so
 * an app that leaves it empty gets a loose `string` (any typo compiles and
 * renders the raw key), while an app that augments it gets the real union.
 *
 * Augmenting with the English catalog gives `<Text text="…" />` autocomplete
 * over every key plus a compile error on a typo, with TypeScript suggesting the
 * nearest match. English is the source of truth; the key-parity test in
 * messages.test.ts keeps the other eight locales aligned with it.
 */
import type en from './messages/en.json';

declare module '@ubersuggest/ui' {
  interface TranslationKeysMap extends Record<keyof typeof en, string> {}
}
