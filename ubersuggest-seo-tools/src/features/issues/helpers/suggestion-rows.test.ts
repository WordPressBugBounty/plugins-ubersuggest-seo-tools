import { describe, expect, it } from 'vitest';

import type { PreviewRow } from '../types';
import {
  applyTargets,
  generatedCount,
  hasApplicableSuggestions,
} from './suggestion-rows';

const row = (overrides: Partial<PreviewRow> & { ref: string }): PreviewRow => ({
  label: `Page ${overrides.ref}`,
  before: 'old',
  after: 'new',
  status: 'idle',
  source: 'ai',
  ...overrides,
});

describe('generatedCount', () => {
  it('counts every page carrying a suggestion, applied or not', () => {
    expect(
      generatedCount([
        row({ ref: '1' }),
        row({ ref: '2', status: 'fixed' }),
        row({ ref: '3', after: null }),
        row({ ref: '4', after: '' }),
      ]),
    ).toBe(2);
  });

  it('reads an absent preview as nothing generated', () => {
    expect(generatedCount(null)).toBe(0);
  });
});

describe('hasApplicableSuggestions', () => {
  it('is true while a generated page is still unapplied', () => {
    expect(hasApplicableSuggestions([row({ ref: '1' })])).toBe(true);
  });

  it('goes false once every generated page is fixed', () => {
    expect(
      hasApplicableSuggestions([
        row({ ref: '1', status: 'fixed' }),
        row({ ref: '2', after: null }),
      ]),
    ).toBe(false);
  });
});

describe('applyTargets', () => {
  it('takes every generated-but-unapplied page when no refs are given', () => {
    const targets = applyTargets([
      row({ ref: '1' }),
      row({ ref: '2' }),
      row({ ref: '3', status: 'fixed' }),
    ]);

    expect(targets.map((target) => target.ref)).toEqual(['1', '2']);
  });

  it('narrows to the requested pages', () => {
    const targets = applyTargets([row({ ref: '1' }), row({ ref: '2' })], ['2']);

    expect(targets.map((target) => target.ref)).toEqual(['2']);
  });

  it('never sends a copy-only row: the backend has nothing to write', () => {
    const targets = applyTargets([
      row({ ref: '1', applyable: false }),
      row({ ref: '2' }),
    ]);

    expect(targets.map((target) => target.ref)).toEqual(['2']);
  });

  it('skips pages with no suggestion to write', () => {
    const targets = applyTargets([
      row({ ref: '1', after: null }),
      row({ ref: '2', after: '' }),
    ]);

    expect(targets).toEqual([]);
  });

  it('reads an absent preview as nothing to apply', () => {
    expect(applyTargets(null)).toEqual([]);
  });
});
