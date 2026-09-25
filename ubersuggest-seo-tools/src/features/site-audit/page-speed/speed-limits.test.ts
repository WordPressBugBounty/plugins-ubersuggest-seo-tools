import { describe, expect, it } from 'vitest';

import { computeColumn, rateValue } from './speed-limits';

describe('rateValue', () => {
  it('rates load time against its thresholds', () => {
    expect(rateValue(2.5, 'load_time', false)).toBe('great');
    expect(rateValue(3, 'load_time', false)).toBe('needs_improvement');
    expect(rateValue(5, 'load_time', false)).toBe('poor');
  });

  it('swaps interactivity thresholds when the value is a lab fallback (TBT vs FID)', () => {
    // 143ms is "needs improvement" as FID (origin, tick 100/300) ...
    expect(rateValue(143, 'interactivity', false)).toBe('needs_improvement');
    // ... but "great" as TBT (lab fallback, tick 200/600).
    expect(rateValue(143, 'interactivity', true)).toBe('great');
  });
});

describe('computeColumn', () => {
  it('builds the load-time column (marker on a value scale, segments on portions)', () => {
    const column = computeColumn('load_time', 5.01, false, 'DESKTOP');
    expect(column.value).toBe('5.01');
    expect(column.unit).toBe('s');
    expect(column.rating).toBe('poor');
    expect(column.markerPct).toBeCloseTo(50.1); // 5.01 / 10 * 100
    expect(column.greenPct).toBeCloseTo(25); // portion 2.5 / 10
    expect(column.amberPct).toBeCloseTo(15); // portion 1.5 / 10
    expect(column.ticks).toEqual(['0s', '2.5s', '4s', '10s+']);
    // Title now comes from i18n (Title case); the UI uppercases it via CSS.
    expect(column.deviceLabel).toBe('DESKTOP Load time');
  });

  it('uses the fallback interactivity profile when isFallback is true', () => {
    const column = computeColumn('interactivity', 312, true, 'MOBILE');
    expect(column.unit).toBe('ms');
    expect(column.rating).toBe('needs_improvement'); // TBT tick 200/600
    expect(column.markerPct).toBeCloseTo(15.6); // 312 / 2000 * 100
    expect(column.greenPct).toBeCloseTo(10); // portion 1 / 10
    expect(column.ticks).toEqual(['0ms', '200ms', '600ms', '2000ms+']);
  });

  it('builds the visual-stability column (unitless)', () => {
    const column = computeColumn('visual_stability', 0.09, false, 'DESKTOP');
    expect(column.value).toBe('0.09');
    expect(column.unit).toBe('');
    expect(column.rating).toBe('great');
    expect(column.markerPct).toBeCloseTo(9); // 0.09 / 1 * 100
    expect(column.ticks).toEqual(['0', '0.1', '0.25', '1+']);
  });

  it('clamps the marker at 100% for values past the axis max', () => {
    expect(computeColumn('load_time', 25, false, 'DESKTOP').markerPct).toBe(
      100,
    );
  });
});
