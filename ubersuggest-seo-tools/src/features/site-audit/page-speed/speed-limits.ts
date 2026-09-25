import { translate } from '@ui';

import type { Rating } from '../types';
import type { SpeedDevice } from './types';

export type SpeedMetricType =
  | 'load_time'
  | 'interactivity'
  | 'visual_stability';

// Render data for one metric column — the exact shape SpeedColumn consumes,
// computed from a raw metric value via the ported tick/portion math below.
export type SpeedColumnData = {
  title: string;
  description: string;
  deviceLabel: string;
  value: string;
  unit: string;
  rating: Rating;
  markerPct: number;
  greenPct: number;
  amberPct: number;
  ticks: string[];
  footer?: string;
};

type Limit = {
  tick: [number, number, number]; // good / needs-improvement / poor (=axis max)
  portion: [number, number, number]; // hand-tuned visual widths of the 3 segments
  unit: string;
};

// Verbatim from ubersuggest-next speed-limits.ts. `interactivity` uses the
// *_fallback profile when the value is Lighthouse TBT (isFallback) instead of
// CrUX FID — the two have different acceptable ranges.
const LIMITS: Record<string, Limit> = {
  load_time: { tick: [2.5, 4, 10], portion: [2.5, 1.5, 6], unit: 's' },
  interactivity: { tick: [100, 300, 600], portion: [1, 2, 3], unit: 'ms' },
  interactivity_fallback: {
    tick: [200, 600, 2000],
    portion: [1, 2, 7],
    unit: 'ms',
  },
  visual_stability: { tick: [0.1, 0.25, 1], portion: [1, 1.5, 7.5], unit: '' },
};

const limitKey = (type: SpeedMetricType, isFallback: boolean): string =>
  type === 'interactivity' && isFallback ? 'interactivity_fallback' : type;

// Rating from the raw value: <= tick[0] great, <= tick[1] needs improvement,
// else poor (ubersuggest-next rateValue).
export function rateValue(
  value: number,
  type: SpeedMetricType,
  isFallback: boolean,
): Rating {
  const { tick } = LIMITS[limitKey(type, isFallback)];
  if (value <= tick[0]) return 'great';
  if (value <= tick[1]) return 'needs_improvement';
  return 'poor';
}

/**
 * Build a column's render data from a raw metric value. The colored segment
 * widths come from `portion` (fixed visual proportions); the marker position is
 * a separate linear value/maxTick scale, clamped only at the high end — exactly
 * as ubersuggest-next's speed-scale-bar.tsx does it.
 */
export function computeColumn(
  type: SpeedMetricType,
  rawValue: number,
  isFallback: boolean,
  device: SpeedDevice,
): SpeedColumnData {
  const { tick, portion, unit } = LIMITS[limitKey(type, isFallback)];
  const maxTick = tick[2];
  const portionTotal = portion[0] + portion[1] + portion[2];

  const value = rawValue.toFixed(2);
  const title = translate(`speed_${type}_title`);

  return {
    title,
    description: translate(`speed_${type}_desc`),
    deviceLabel: `${device} ${title}`,
    value,
    unit,
    rating: rateValue(rawValue, type, isFallback),
    markerPct: Math.min(100, (Number(value) / maxTick) * 100),
    greenPct: (portion[0] / portionTotal) * 100,
    amberPct: (portion[1] / portionTotal) * 100,
    ticks: [
      `0${unit}`,
      `${tick[0]}${unit}`,
      `${tick[1]}${unit}`,
      `${tick[2]}${unit}+`,
    ],
    footer:
      type === 'visual_stability'
        ? undefined
        : translate(`speed_${type}_footer`),
  };
}
