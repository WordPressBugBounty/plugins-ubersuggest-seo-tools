import { cn, Text, translate } from '@ui';

import { formatNumber } from '../../../lib/format';
import { CARD, CardLabel } from '../../../ui/card';
import { useAudit } from '../audit-context';
import { useOverviewMetrics } from '../hooks/use-overview-metrics';

// A box value: a number, null while its metric is loading, or undefined when
// the account can't provide it (shown as "—", never a fake figure).
function BoxValue({ value }: { value: number | null | undefined }) {
  if (value === null) {
    return <span className="h-8 w-20 animate-pulse rounded bg-zinc-100" />;
  }
  return (
    <Text size="3xl" weight="bold" className="text-zinc-950">
      {value === undefined ? '—' : formatNumber(value)}
    </Text>
  );
}

export function OverviewBoxes() {
  'use memo';
  const audit = useAudit();
  // On-page SEO score comes from the audit itself; traffic / keywords /
  // backlinks are domain-level metrics fetched separately (day-cached).
  const metrics = useOverviewMetrics();
  const metric = (key: 'organicTraffic' | 'organicKeywords' | 'backlinks') => {
    if (metrics === null) return null; // still loading
    if (metrics === 'unavailable') return undefined; // the account can't provide it
    return metrics[key];
  };

  const boxes = [
    {
      label: translate('overview_seo_score'),
      hint: 'overview_seo_score_hint',
      value: audit.overview.seoScore as number | null | undefined,
      isScore: true,
    },
    {
      label: translate('overview_organic_traffic'),
      hint: 'overview_organic_traffic_hint',
      value: metric('organicTraffic'),
      isScore: false,
    },
    {
      label: translate('overview_organic_keywords'),
      hint: 'overview_organic_keywords_hint',
      value: metric('organicKeywords'),
      isScore: false,
    },
    {
      label: translate('overview_backlinks'),
      hint: 'overview_backlinks_hint',
      value: metric('backlinks'),
      isScore: false,
    },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {boxes.map((box) => (
        <div key={box.label} className={cn(CARD, 'flex flex-col gap-1 p-5')}>
          <CardLabel hint={box.hint}>{box.label}</CardLabel>
          <div className="flex items-center gap-2">
            <BoxValue value={box.value} />
            {box.isScore && typeof box.value === 'number' && box.value > 70 && (
              <Text
                size="xs"
                className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 uppercase"
                text="rating_great"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
