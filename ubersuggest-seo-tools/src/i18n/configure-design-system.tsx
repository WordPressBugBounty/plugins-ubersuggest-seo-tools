/**
 * Teach @ubersuggest/ui how to translate.
 *
 * The design system ships its translation layer UNCONFIGURED: both `<Text
 * text="key" />` and its exported `translate('key')` return the raw key until an
 * app injects a translator here. After this call, app code imports `translate`
 * from '@ui' — exactly as ubersuggest-next imports it from '@ubersuggest/ui' —
 * and never touches src/i18n directly.
 *
 * Called once at boot, AFTER initI18n: the translator needs its catalog loaded.
 *
 * Mirrors ubersuggest-next's configure-translations.tsx. The shapes differ only
 * in where the translator comes from (a module singleton here, a per-render
 * next-intl hook there) because this bundle has no server side.
 */
import { configureText, type TranslationKeys } from '@ubersuggest/ui';
import type { ReactNode } from 'react';

import { currentTranslator, translate } from './index';

/** A <b>…</b> / <strong>…</strong> pair, which ICU parses as a rich tag. */
const PAIRED_TAG_REGEX = /<(b|strong)>[\s\S]*?<\/\1>/;

/**
 * Any `<…>` that is NOT emphasis the design system's parseTags understands.
 *
 * SEO copy quotes HTML at the user: "add the meta charset attribute
 * (<meta charset="utf-8"/>)", "declare <!Doctype> before <html>". ICU
 * MessageFormat reads every `<…>` as a tag and fails on those, taking the whole
 * message down with it — including any real <b> in the same paragraph.
 */
const NON_EMPHASIS_TAG_REGEX = /<(?!\/?(?:b|strong|br)\s*\/?>)[^>]+>/;

export function configureDesignSystemText(): void {
  configureText({
    translation: translate,
    call: ({ text, variables }) => translateForDesignSystem(text, variables),
  });
}

/**
 * Returns a STRING by default, and a ReactNode only when a variable is itself an
 * element. The distinction matters because the design system's `Text` branches on
 * it (see text.mjs): a string goes through `parseTags`, which turns `<b>` into
 * real elements styled by `translationConfig.boldClassName`; a node is rendered
 * untouched, so on that path emphasis has to come from the tag handlers here
 * instead. The two are mutually exclusive by design.
 *
 * Either way a message with emphasis has to be rendered via `text=`, NOT as
 * `{translate('key')}` children — in children position nothing parses the tags.
 */
function translateForDesignSystem(
  text: TranslationKeys,
  variables: ReadonlyArray<string | number | ReactNode>,
): string | ReactNode {
  const translator = currentTranslator();
  // Before initI18n (or if it failed): render the key rather than throw.
  if (!translator) return text;

  const key = text as string;
  if (!translator.has(key)) return text;

  const raw = translator.raw(key);

  // A React element as an interpolation value (a link inside a sentence, as the
  // issue explainer's copy does) can only survive on the rich path.
  if (hasElementVariable(variables)) {
    return translator.rich(key, {
      ...richValues(variables),
      b: (chunks: ReactNode) => <b className="font-semibold">{chunks}</b>,
      strong: (chunks: ReactNode) => (
        <strong className="font-semibold">{chunks}</strong>
      ),
    });
  }

  const values = positionalValues(variables);

  // Copy that quotes HTML at the user cannot go through ICU at all. With nothing
  // to interpolate there is no reason to: hand back the raw message and let the
  // design system's parseTags turn any <b>/<strong> into elements while leaving
  // `<meta charset="utf-8"/>` as the literal snippet the reader is meant to copy.
  // Checked BEFORE the markup path below, because a paragraph can hold both.
  if (
    variables.length === 0 &&
    typeof raw === 'string' &&
    NON_EMPHASIS_TAG_REGEX.test(raw)
  ) {
    return raw;
  }

  if (typeof raw === 'string' && PAIRED_TAG_REGEX.test(raw)) {
    // markup() is the string-returning sibling of rich(): same tag parsing, but
    // the handlers re-emit the tags as text for parseTags to pick up downstream.
    return translator.markup(key, {
      ...values,
      b: (chunks: string) => `<b>${chunks}</b>`,
      strong: (chunks: string) => `<strong>${chunks}</strong>`,
    });
  }

  return translator(key, values);
}

/** Whether any variable is a React element rather than a primitive. */
function hasElementVariable(
  variables: ReadonlyArray<string | number | ReactNode>,
): boolean {
  return variables.some(
    (variable) =>
      variable !== null &&
      variable !== undefined &&
      typeof variable !== 'string' &&
      typeof variable !== 'number',
  );
}

/**
 * Positional values for the rich path, elements included.
 *
 * use-intl types message values as string | number | Date on EVERY path, so an
 * element has no home in its signature — ubersuggest-next passes one anyway
 * behind a @ts-expect-error, and this is the same suppression. Verified against
 * our own engine before adopting it (see configure-design-system.test.tsx):
 * rich() does interpolate an element, and does so alongside a <b> tag handler.
 */
function richValues(
  variables: ReadonlyArray<string | number | ReactNode>,
): Record<string, string | number | Date> {
  const values: Record<string, string | number | Date> = {};
  variables.forEach((variable, index) => {
    if (variable === null || variable === undefined) return;
    // @ts-expect-error - an element is not in use-intl's value union; it is
    // interpolated correctly at runtime, which the tests assert.
    values[String(index)] = variable;
  });
  return values;
}

/**
 * The design system passes interpolation values POSITIONALLY (`translate(key, a,
 * b)`), so the catalog addresses them as {0}, {1} — the same convention as
 * ubersuggest-next.
 *
 * Primitives only: this feeds the string paths, where a non-primitive would
 * stringify to "[object Object]". A dropped variable leaves its placeholder
 * unfilled, and use-intl then falls back to rendering the key — a visible
 * failure rather than corrupted copy. Element variables never reach here;
 * hasElementVariable routes them to the rich path first.
 */
function positionalValues(
  variables: ReadonlyArray<string | number | ReactNode>,
): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  variables.forEach((variable, index) => {
    if (typeof variable === 'string' || typeof variable === 'number') {
      values[String(index)] = variable;
    }
  });
  return values;
}
