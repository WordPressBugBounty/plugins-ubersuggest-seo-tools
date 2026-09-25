import { describe, expect, it } from 'vitest';

import type { PreviewRow } from '../types';
import { mergePreviewRows } from './merge-preview-rows';

const row = (overrides: Partial<PreviewRow> & { ref: string }): PreviewRow => ({
  label: `Page ${overrides.ref}`,
  before: 'old',
  after: null,
  status: 'idle',
  source: null,
  ...overrides,
});

describe('mergePreviewRows', () => {
  it('takes the fresh list whole when there is nothing on screen yet', () => {
    const fresh = [row({ ref: '1' }), row({ ref: '2' })];

    expect(mergePreviewRows(null, fresh)).toBe(fresh);
  });

  it('keeps a page confirmed fixed even when the server still offers a suggestion', () => {
    const existing = [row({ ref: '1', status: 'fixed', after: 'written' })];
    const fresh = [row({ ref: '1', status: 'ready', after: 'cached' })];

    // Demoting the green card would tell the user their fix came undone.
    expect(mergePreviewRows(existing, fresh)).toEqual(existing);
  });

  it('lets the server confirm a fix it already knows about', () => {
    const existing = [row({ ref: '1', status: 'fixed', after: 'written' })];
    const fresh = [row({ ref: '1', status: 'fixed', after: 'written' })];

    expect(mergePreviewRows(existing, fresh)).toEqual(fresh);
  });

  it('keeps a suggestion on screen when the fresh row brings none', () => {
    const existing = [row({ ref: '1', after: 'generated', status: 'ready' })];
    const fresh = [row({ ref: '1', after: null })];

    expect(mergePreviewRows(existing, fresh)[0].after).toBe('generated');
  });

  it('takes a fresh suggestion for a row that had none', () => {
    const existing = [row({ ref: '1', after: null })];
    const fresh = [row({ ref: '1', after: 'restored', status: 'ready' })];

    expect(mergePreviewRows(existing, fresh)[0].after).toBe('restored');
  });

  it('prefers a fresh suggestion over the one already shown', () => {
    const existing = [row({ ref: '1', after: 'old suggestion' })];
    const fresh = [row({ ref: '1', after: 'new suggestion' })];

    expect(mergePreviewRows(existing, fresh)[0].after).toBe('new suggestion');
  });

  it('keeps pages fixed this session that the fresh scan no longer lists', () => {
    const existing = [
      row({ ref: '1', status: 'fixed', after: 'written' }),
      row({ ref: '2' }),
    ];
    const fresh = [row({ ref: '2' })];

    const merged = mergePreviewRows(existing, fresh);
    expect(merged.map((entry) => entry.ref)).toEqual(['2', '1']);
    expect(merged[1].status).toBe('fixed');
  });

  it('drops an unfixed page the fresh scan stopped listing', () => {
    const existing = [row({ ref: '1' }), row({ ref: '2' })];
    const fresh = [row({ ref: '2' })];

    expect(mergePreviewRows(existing, fresh).map((entry) => entry.ref)).toEqual(
      ['2'],
    );
  });

  it('reads an empty suggestion the same as no suggestion', () => {
    const existing = [row({ ref: '1', after: 'generated' })];
    const fresh = [row({ ref: '1', after: '' })];

    expect(mergePreviewRows(existing, fresh)[0].after).toBe('generated');
  });
});
