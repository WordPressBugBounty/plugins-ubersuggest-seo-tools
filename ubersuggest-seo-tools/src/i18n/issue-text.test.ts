import { describe, expect, it } from 'vitest';

import phpIssueLabels from '../../includes/class-issue-labels.php?raw';
import { issueDescription, issueName } from './issue-text';
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

// The PHP label map is the plugin's mirror of every issue ID the crawl can
// report, and it's what the REST payload falls back to. Reading it here means a
// new ID added server-side can't ship without its translations: it fails this
// test instead of quietly rendering English in all nine locales.
const ISSUE_IDS = [
  ...phpIssueLabels.matchAll(/'([a-z0-9_]+)'\s*=>\s*__\(/g),
].map((match) => match[1]);

describe('issue text', () => {
  it('reads the issue IDs out of the PHP label map', () => {
    expect(ISSUE_IDS).toContain('absent_h1_tags');
    expect(ISSUE_IDS.length).toBeGreaterThanOrEqual(24);
  });

  it.each(Object.keys(catalogs))('%s names every issue', (locale) => {
    const missing = ISSUE_IDS.filter(
      (issueId) => !(`issue_name_${issueId}` in catalogs[locale]),
    );
    expect(missing).toEqual([]);
  });

  // Descriptions are the count-trailing fragment the issues table reads. Flash
  // has no fragment in the app's catalog either, so it's exempt here too.
  const WITHOUT_DESCRIPTION = new Set(['pages_with_flash']);

  it.each(Object.keys(catalogs))('%s describes every issue', (locale) => {
    const missing = ISSUE_IDS.filter(
      (issueId) =>
        !WITHOUT_DESCRIPTION.has(issueId) &&
        !(`issue_desc_${issueId}` in catalogs[locale]),
    );
    expect(missing).toEqual([]);
  });

  it('translates instead of echoing the server label', () => {
    // The server label reaching the screen is the bug this guards: it means the
    // catalog lookup missed and the user is reading untranslated English.
    expect(issueName('absent_h1_tags', 'SERVER LABEL')).toBe('No H1 tag');
    expect(issueDescription('absent_h1_tags', 'SERVER LABEL')).toBe(
      'without a H1 heading',
    );
  });

  it('falls back to the server label for an unmapped issue', () => {
    expect(
      issueName('brand_new_backend_issue', 'Brand new backend issue'),
    ).toBe('Brand new backend issue');
  });

  it('never leaks a raw catalog key', () => {
    expect(issueName('brand_new_backend_issue')).toBe('');
    expect(issueDescription('brand_new_backend_issue')).toBe('');
  });
});
