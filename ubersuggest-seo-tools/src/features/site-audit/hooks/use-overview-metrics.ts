import { useEffect, useState } from 'react';

import { apiGet } from '../../../api';

export type OverviewMetrics = {
  organicTraffic: number;
  organicKeywords: number;
  backlinks: number;
};

type OverviewMetricsResponse = Partial<OverviewMetrics> & {
  unavailable?: boolean;
};

/**
 * Domain-level metrics for the overview boxes (organic traffic / keywords /
 * backlinks). Served by the plugin from a day-long cache, since the backend
 * call spends a report credit. Returns null while loading and 'unavailable'
 * when the account can't provide them (old token without the `domain` scope,
 * no data for the domain) — the boxes then show "—" instead of fake numbers.
 */
export function useOverviewMetrics(): OverviewMetrics | 'unavailable' | null {
  const [metrics, setMetrics] = useState<
    OverviewMetrics | 'unavailable' | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<OverviewMetricsResponse>('overview-metrics')
      .then((data) => {
        if (cancelled) return;
        if (data.unavailable || data.organicTraffic == null) {
          setMetrics('unavailable');
          return;
        }
        setMetrics({
          organicTraffic: data.organicTraffic,
          organicKeywords: data.organicKeywords ?? 0,
          backlinks: data.backlinks ?? 0,
        });
      })
      .catch(() => {
        if (!cancelled) setMetrics('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return metrics;
}
