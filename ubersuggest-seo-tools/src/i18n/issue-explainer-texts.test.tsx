import { render } from '@testing-library/react';
import { Text } from '@ui';
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
import { dynamicKey } from './translate-dynamic';

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

// Every issue that can appear in the list. The explainer renders a what/how pair
// for each, so a text that fails to format degrades to a visible raw key.
const ISSUE_IDS = [
  'absent_doctype',
  'absent_encoding_meta_tag',
  'absent_h1_tags',
  'compression_disabled',
  'content_count_words',
  'duplicate_meta_description_tags',
  'duplicate_meta_descriptions',
  'have_broken_links_anchor',
  'have_sitemap',
  'have_title_duplicates',
  'meta_description_empty',
  'page_allowed',
  'response_code_4xx',
  'seo_friendly_url_relative_length_check',
  'seo_non_friendly_url',
  'ssl_certificate_expiration',
  'ssl_certificate_valid',
  'temporary_redirects',
  'time_load_high',
  'title_duplicate_tag',
  'title_empty',
  'title_short',
  'title_long',
];

const EXPLAINER_KEYS = ISSUE_IDS.flatMap((id) => [
  `issue_what_${id}`,
  `issue_how_${id}`,
]);

describe('issue explainer texts', () => {
  it('every locale carries all 46 what/how keys', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const missing = EXPLAINER_KEYS.filter((key) => !(key in catalog));
      expect(missing, `${locale} missing`).toEqual([]);
    }
  });

  // The real hazard: these are long prose paragraphs, and two of them quote HTML
  // at the reader (`<meta charset="utf-8"/>`, `<!Doctype>`, `<html>`). ICU
  // MessageFormat reads every `<…>` as a tag and fails on those, degrading the
  // message to its key — which the user then reads on screen. Formatting each one
  // through the real adapter is the only way to know they all survive.
  //
  // Twelve texts interpolate an article link at {0}; they are exercised with an
  // element, exactly as the explainer renders them.
  const withLink = new Set([
    'issue_how_duplicate_meta_description_tags',
    'issue_how_duplicate_meta_descriptions',
    'issue_how_have_sitemap',
    'issue_how_have_title_duplicates',
    'issue_how_meta_description_empty',
    'issue_what_seo_friendly_url_relative_length_check',
    'issue_what_seo_non_friendly_url',
    'issue_how_ssl_certificate_valid',
    'issue_how_title_duplicate_tag',
    'issue_how_title_empty',
    'issue_what_title_long',
    'issue_what_title_short',
  ]);

  const link = (
    <a key="a" href="https://example.com">
      this
    </a>
  );

  it.each(EXPLAINER_KEYS)('%s renders without leaking its key', (key) => {
    const variables = withLink.has(key) ? [link] : [];
    const { container } = render(
      <Text
        text={dynamicKey(key)}
        translationConfig={{ translationVariables: variables }}
      />,
    );
    const rendered = container.textContent ?? '';
    expect(rendered, key).not.toBe(key);
    expect(rendered.length, key).toBeGreaterThan(20);
  });

  it('keeps quoted HTML literal while still bolding emphasis', () => {
    const { container } = render(
      <Text text={dynamicKey('issue_how_absent_encoding_meta_tag')} />,
    );
    // The snippet is what the reader is meant to copy — it must survive verbatim.
    expect(container.textContent).toContain('<meta charset="utf-8"/>');
    // …and the emphasis in the same paragraph still becomes real elements.
    expect(container.querySelectorAll('b').length).toBeGreaterThan(0);
  });

  it('keeps <!Doctype> and <html> literal', () => {
    const { container } = render(
      <Text text={dynamicKey('issue_how_absent_doctype')} />,
    );
    expect(container.textContent).toContain('<html>');
  });

  it('interpolates the article link where a text expects one', () => {
    const { container } = render(
      <Text
        text={dynamicKey('issue_how_have_sitemap')}
        translationConfig={{ translationVariables: [link] }}
      />,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com',
    );
  });
});
