import { describe, expect, it } from 'vitest';

import { extractDeviceMetrics } from './extract-metrics';
import type { DeviceReport } from './types';

describe('extractDeviceMetrics', () => {
  it('returns null when there is no report or it is not ok', () => {
    expect(extractDeviceMetrics(undefined)).toBeNull();
    expect(extractDeviceMetrics({ status: 'pending' })).toBeNull();
    expect(extractDeviceMetrics({ status: 'error' })).toBeNull();
  });

  it('uses CrUX origin field data when complete', () => {
    const report: DeviceReport = {
      status: 'ok',
      originData: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1600 },
          FIRST_INPUT_DELAY_MS: { percentile: 50 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 },
        },
      },
    };
    expect(extractDeviceMetrics(report)).toEqual({
      loadTimeSeconds: 1.6,
      interactivityMs: 50,
      visualStability: 0.05,
      isFallback: false,
    });
  });

  it('falls back to Lighthouse lab data when origin is incomplete (missing FID)', () => {
    const report: DeviceReport = {
      status: 'ok',
      originData: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1600 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 },
          // no FIRST_INPUT_DELAY_MS — CrUX dropped FID for many origins
        },
      },
      labData: {
        'largest-contentful-paint': { numericValue: 1622 },
        'total-blocking-time': { numericValue: 143 },
        'cumulative-layout-shift': { numericValue: 0.05 },
      },
    };
    const metrics = extractDeviceMetrics(report);
    expect(metrics?.isFallback).toBe(true);
    expect(metrics?.loadTimeSeconds).toBeCloseTo(1.622);
    expect(metrics?.interactivityMs).toBe(143);
    expect(metrics?.visualStability).toBeCloseTo(0.05);
  });

  it('returns null when neither origin nor lab data is usable', () => {
    expect(
      extractDeviceMetrics({
        status: 'ok',
        originData: { metrics: {} },
        labData: {},
      }),
    ).toBeNull();
  });
});
