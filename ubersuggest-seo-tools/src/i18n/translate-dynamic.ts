import { type TranslationKeys, translate } from '@ui';

/**
 * `translate()` for keys built at RUNTIME (`rating_${level}`, `status_${key}`),
 * which the TranslationKeys union can't describe. Centralizes the single
 * unavoidable cast so it isn't scattered across call sites — the same helper
 * ubersuggest-next keeps in shared/utils/translate-dynamic.ts.
 *
 * Use `translate()` directly for static keys: only that path gets typo checking.
 *
 * Primitive variables only, which guarantees a string return; for ReactNode
 * interpolation call `translate()` directly.
 */
export function translateDynamic(
  key: string,
  ...variables: Array<string | number>
): string {
  return translate(key as TranslationKeys, ...variables) as string;
}

/**
 * A runtime key typed for a component `text` prop, e.g.
 * `<Text text={dynamicKey(`rating_${rating}`)} />`.
 */
export function dynamicKey(key: string): TranslationKeys {
  return key as TranslationKeys;
}
