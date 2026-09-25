import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatSiteDateTime } from './format';

afterEach(() => vi.unstubAllEnvs());

describe('formatSiteDateTime', () => {
  /**
   * The whole string, with an explicit locale: `toContain('2:20')` passed on a
   * 12-hour ICU build and would have broken on a 24-hour one for a reason
   * unrelated to the helper — while still passing on an hour that had shifted
   * to 12:20.
   */
  it('renders the components PHP sent, verbatim', () => {
    expect(formatSiteDateTime('2026-09-04 14:20:33', 'en-US')).toBe(
      'Sep 4, 2026, 2:20 PM',
    );
  });

  /**
   * The viewer's own timezone must not touch the digits. This wall clock falls
   * in New York's spring-forward gap, where reading it as local time has no
   * instant to land on and the Date normalizes an hour forward.
   */
  it('survives a wall clock inside the viewer timezone DST gap', () => {
    vi.stubEnv('TZ', 'America/New_York');

    expect(formatSiteDateTime('2026-03-08 02:30:00', 'en-US')).toBe(
      'Mar 8, 2026, 2:30 AM',
    );
  });

  it('falls back to the raw value when the timestamp is unparseable', () => {
    expect(formatSiteDateTime('not a date', 'en-US')).toBe('not a date');
  });
});
