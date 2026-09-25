import type { DeviceMetrics, DeviceReport } from './types';

// Missing/invalid numbers read as -1, so the guards below reject them (mirrors
// ubersuggest-next's readNumber).
const readNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : -1;

const usable = (metrics: Omit<DeviceMetrics, 'isFallback'>): boolean =>
  metrics.loadTimeSeconds > 0 &&
  metrics.interactivityMs >= 0 &&
  metrics.visualStability >= 0;

/**
 * Reduce a device report to the three metrics the card shows. Tries CrUX
 * real-user field data first; falls back to Lighthouse lab data (flagged
 * isFallback) when the field data is incomplete. Verbatim port of
 * ubersuggest-next's extract-device-metrics.ts.
 *
 * Units: load time in seconds (LCP ms ÷ 1000), interactivity in ms
 * (FID field / TBT lab), visual stability unitless (CLS; CrUX stores it ×100).
 */
export function extractDeviceMetrics(
  report: DeviceReport | undefined,
): DeviceMetrics | null {
  if (!report || report.status !== 'ok') {
    return null;
  }

  const origin = report.originData?.metrics ?? {};
  const originMetrics = {
    loadTimeSeconds:
      readNumber(origin.LARGEST_CONTENTFUL_PAINT_MS?.percentile) / 1000,
    interactivityMs: readNumber(origin.FIRST_INPUT_DELAY_MS?.percentile),
    visualStability:
      readNumber(origin.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile) / 100,
  };
  if (usable(originMetrics)) {
    return { ...originMetrics, isFallback: false };
  }

  const lab = report.labData ?? {};
  const labMetrics = {
    loadTimeSeconds:
      readNumber(lab['largest-contentful-paint']?.numericValue) / 1000,
    interactivityMs: readNumber(lab['total-blocking-time']?.numericValue),
    visualStability: readNumber(lab['cumulative-layout-shift']?.numericValue),
  };
  if (usable(labMetrics)) {
    return { ...labMetrics, isFallback: true };
  }

  return null;
}
