/**
 * Tiny i18n facade over use-intl (the framework-agnostic core of next-intl, the
 * same engine ubersuggest-next uses). The language comes from the WordPress site
 * locale (passed into the iframe, read via api.ts `config().lang`), so it's fixed
 * per session — we build ONE translator at boot (initI18n, from main.tsx) and
 * keep translate() synchronous everywhere after.
 *
 * Messages are ICU (https://formatjs.io/docs/core-concepts/icu-syntax): named
 * args like {count}/{error}, and plurals available via {count, plural, …}.
 * A missing key degrades to the key itself, so nothing renders blank.
 */
import { createTranslator } from 'use-intl/core';

import { config } from '../api';

export type Lang = 'en' | 'pt' | 'es' | 'de' | 'fr' | 'it' | 'nl' | 'ja' | 'zh';

export const SUPPORTED_LANGS: readonly Lang[] = [
  'en',
  'pt',
  'es',
  'de',
  'fr',
  'it',
  'nl',
  'ja',
  'zh',
];

export function currentLang(): Lang {
  const raw = config().lang;
  return (SUPPORTED_LANGS as readonly string[]).includes(raw)
    ? (raw as Lang)
    : 'en';
}

type Messages = Record<string, string>;
type Values = Record<string, string | number>;

/**
 * The use-intl translator: callable for the plain-string path, plus `.rich()`
 * (ReactNode, for messages carrying <b>/<strong> tags), `.has()` and `.raw()`.
 * It's the same surface ubersuggest-next drives from next-intl, so the design
 * system adapter in configure-design-system.tsx can mirror theirs.
 */
type Translator = ReturnType<typeof createTranslator>;

let translator: Translator | null = null;

/**
 * Build the translator once with the active locale's messages (merged over
 * English as the fallback base). Called from main.tsx before the app renders.
 */
export function initI18n(locale: Lang, messages: Messages): void {
  translator = createTranslator({
    locale,
    messages,
    // Match the old graceful behaviour: a missing/broken key shows the key
    // itself instead of throwing.
    onError: () => {},
    getMessageFallback: ({ key }) => key,
  });
}

/**
 * The live translator, or null before initI18n has run.
 *
 * Only the design-system adapter should reach for this. Application code calls
 * `translate` imported from '@ui' — the design system's own export, which routes
 * back here through the function configureText installed.
 */
export function currentTranslator(): Translator | null {
  return translator;
}

/**
 * Translate a key to a plain string with optional ICU values. This is what the
 * adapter injects into the design system; app code should not import it (see
 * currentTranslator above).
 */
export function translate(key: string, values?: Values): string {
  return translator ? translator(key, values) : key;
}
