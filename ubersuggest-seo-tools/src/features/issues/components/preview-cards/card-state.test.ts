import { describe, expect, it } from 'vitest';

import type { PreviewRow } from '../../types';
import { cardState } from './card-state';

const row = (over: Partial<PreviewRow> = {}): PreviewRow => ({
  ref: '1',
  label: 'Page',
  before: '',
  after: null,
  status: 'idle',
  source: null,
  ...over,
});

describe('cardState', () => {
  it('resolves each status to its state', () => {
    expect(cardState(row({ status: 'info' }), false, true)).toBe('info');
    expect(cardState(row({ status: 'fixed' }), false, true)).toBe('fixed');
    expect(cardState(row({ status: 'pending' }), false, true)).toBe('pending');
    expect(cardState(row({ after: 'text' }), false, true)).toBe('suggestion');
    expect(cardState(row({ status: 'limit' }), false, true)).toBe('blocked');
    expect(cardState(row(), false, false)).toBe('blocked');
    expect(cardState(row({ status: 'fallback' }), false, true)).toBe('failed');
    expect(cardState(row(), false, true)).toBe('idle');
  });

  it('generation in flight wins over a stale suggestion', () => {
    expect(cardState(row({ after: 'old' }), true, true)).toBe('pending');
  });

  it('a fixed row stays green even while out of credits', () => {
    expect(cardState(row({ status: 'fixed' }), false, false)).toBe('fixed');
  });

  it('an existing suggestion still shows when out of credits', () => {
    expect(cardState(row({ after: 'text' }), false, false)).toBe('suggestion');
  });

  it('an existing suggestion wins over a failed status', () => {
    expect(
      cardState(row({ status: 'fallback', after: 'text' }), false, true),
    ).toBe('suggestion');
  });
});
