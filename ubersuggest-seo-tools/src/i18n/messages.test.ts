import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';

import de from './messages/de.json';
import en from './messages/en.json';
import es from './messages/es.json';
import fr from './messages/fr.json';
import itItalian from './messages/it.json'; // aliased: `it` collides with Vitest's it()
import ja from './messages/ja.json';
import nl from './messages/nl.json';
import pt from './messages/pt.json';
import zh from './messages/zh.json';

const catalogs: Record<string, Record<string, string>> = {
  en,
  pt,
  es,
  de,
  fr,
  it: itItalian,
  nl,
  ja,
  zh,
};

const englishKeys = Object.keys(en).sort();

// Keys taking ICU arguments. Values are POSITIONAL ({0}, {1}) because the design
// system passes interpolation variables positionally — see
// configure-design-system.tsx. Each entry lists the substituted values we expect
// to find in the output, so a placeholder the conversion missed fails loudly
// instead of formatting to an empty string.
const plainChecks: Array<[string, Record<string, string | number>, string[]]> =
  [
    ['pages_count', { 0: 2 }, ['2']],
    ['credits_left', { 0: 3 }, ['3']],
    ['crawling_progress', { 0: 5 }, ['5']],
    ['couldnt_load_audit', { 0: 'boom' }, ['boom']],
    ['couldnt_load_issues', { 0: 'boom' }, ['boom']],
  ];

// Messages carrying <b> emphasis go through the rich/markup path — the plain
// formatter would read the tag as an unclosed ICU tag and drop the text.
const richChecks: Array<[string, Record<string, string | number>, string[]]> = [
  ['pages_crawled_summary', { 0: '10', 1: '2' }, ['10', '2']],
  ['neil_panel_summary', { 0: '10' }, ['10']],
];

describe('message catalogs', () => {
  // Every locale must carry exactly the English key set — no missing keys (which
  // fall back to English silently) and no dead keys left after English changes.
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === 'en') continue;
    it(`${locale} has exactly the English key set`, () => {
      expect(Object.keys(catalog).sort()).toEqual(englishKeys);
    });
  }

  // Every locale's ICU messages must parse AND substitute their placeholders.
  for (const [locale, catalog] of Object.entries(catalogs)) {
    it(`${locale} formats positional ICU messages`, () => {
      const translate = createTranslator({ locale, messages: catalog });
      for (const [key, values, expected] of plainChecks) {
        const formatted = translate(key, values);
        expect(formatted, `${locale}/${key}`).not.toBe(key);
        for (const value of expected) {
          expect(formatted, `${locale}/${key}`).toContain(value);
        }
      }
    });

    it(`${locale} formats <b> emphasis messages`, () => {
      const translate = createTranslator({ locale, messages: catalog });
      for (const [key, values, expected] of richChecks) {
        // markup() is the string-returning sibling of rich() — same tag parsing,
        // assertable without rendering React.
        const formatted = translate.markup(key, {
          ...values,
          b: (chunks: string) => `<b>${chunks}</b>`,
        });
        expect(formatted, `${locale}/${key}`).toContain('<b>');
        for (const value of expected) {
          expect(formatted, `${locale}/${key}`).toContain(value);
        }
      }
    });
  }
});
