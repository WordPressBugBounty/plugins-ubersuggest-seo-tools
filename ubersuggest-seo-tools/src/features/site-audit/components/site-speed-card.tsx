import { Button, cn, type SelectOption, Tabs, Text, translate } from '@ui';
import { useState } from 'react';

import { DesktopIcon, MobileIcon } from '../../../icons';
import { CARD, CardLabel } from '../../../ui/card';
import type { ConnectPrompt } from '../../../ui/connect-account-card';
import { useAudit } from '../audit-context';
import { useSiteSpeed } from '../hooks/use-site-speed';
import { extractDeviceMetrics } from '../page-speed/extract-metrics';
import {
  computeColumn,
  type SpeedColumnData,
} from '../page-speed/speed-limits';
import type { SpeedDevice } from '../page-speed/types';
import type { Rating } from '../types';

const RATING_BADGE: Record<Rating, string> = {
  great: 'bg-emerald-100 text-emerald-700',
  needs_improvement: 'bg-amber-100 text-amber-700',
  poor: 'bg-red-100 text-red-700',
};

function SpeedColumn({
  data,
  device,
}: {
  data: SpeedColumnData;
  device: SpeedDevice;
}) {
  const audit = useAudit();
  const rosePct = Math.max(0, 100 - data.greenPct - data.amberPct);
  const DeviceIcon = device === 'DESKTOP' ? DesktopIcon : MobileIcon;
  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <Text
        size="xs"
        weight="semibold"
        className="text-zinc-900 uppercase tracking-wide"
      >
        {data.title}
      </Text>
      <Text size="sm" color="muted" className="min-h-[72px]">
        {data.description}
      </Text>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <DeviceIcon size={18} className="text-zinc-500" />
          <Text size="xs" color="muted" className="uppercase tracking-wide">
            {data.deviceLabel}
          </Text>
        </div>
        <div className="flex items-baseline gap-2">
          <Text size="2xl" weight="bold" className="text-zinc-950">
            {data.value}
          </Text>
          {data.unit && (
            <Text size="sm" color="muted">
              {data.unit}
            </Text>
          )}
          <Text
            size="xs"
            className={cn(
              'rounded px-2 py-0.5 font-semibold uppercase',
              RATING_BADGE[data.rating],
            )}
            text={`rating_${data.rating}`}
          />
        </div>
        <Text size="sm" weight="semibold" className="text-zinc-900">
          {audit.domain}
        </Text>

        <div className="flex flex-col gap-1">
          <div className="relative pt-5">
            <span
              className="-translate-x-1/2 absolute top-0 whitespace-nowrap font-semibold text-xs text-zinc-800"
              style={{ left: `${data.markerPct}%` }}
            >
              {data.value}
              {data.unit}
            </span>
            <div className="relative flex h-3 w-full overflow-hidden rounded-sm">
              <div
                className="h-full bg-emerald-300"
                style={{ width: `${data.greenPct}%` }}
              />
              <div
                className="h-full bg-amber-300"
                style={{ width: `${data.amberPct}%` }}
              />
              <div
                className="h-full bg-rose-300"
                style={{ width: `${rosePct}%` }}
              />
              <span
                className="absolute top-0 h-full w-0.5 bg-zinc-800"
                style={{ left: `calc(${data.markerPct}% - 1px)` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[11px] text-zinc-500">
            {data.ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </div>

        {data.footer && (
          <Text size="xs" color="muted">
            {data.footer}
          </Text>
        )}
      </div>
    </div>
  );
}

/**
 * The card's variable region: measuring → error → no data → the metric columns.
 * Early returns keep the four outcomes flat and independently readable, instead
 * of a nested ternary chain where each branch's meaning depends on the ones
 * above it.
 */
function SpeedBody({
  loading,
  error,
  connectPrompt,
  columns,
  device,
}: {
  loading: boolean;
  error: string | null;
  connectPrompt: ConnectPrompt | null;
  columns: SpeedColumnData[];
  device: SpeedDevice;
}) {
  if (loading) {
    return (
      <Text
        size="sm"
        color="muted"
        className="py-8 text-center"
        text="measuring_speed"
      />
    );
  }
  // Panel-sized on purpose: ConnectAccountCard is a full-page treatment that
  // site-audit.tsx renders INSTEAD of the page, and it would dwarf this card.
  // The keys are shared with it so the wording stays one voice. The title reads
  // as a complete line here, where its body text is written about the audit.
  if (connectPrompt) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Text
          size="sm"
          color="muted"
          text={
            connectPrompt.expired
              ? 'session_expired_title'
              : 'not_connected_title'
          }
        />
        <Button asChild variant="primary-solid">
          <a href={connectPrompt.connectUrl} target="_top">
            {translate(
              connectPrompt.expired ? 'reconnect_account' : 'connect_account',
            )}
          </a>
        </Button>
      </div>
    );
  }
  if (error) {
    return (
      <Text size="sm" color="muted" className="py-8 text-center">
        {error}
      </Text>
    );
  }
  if (columns.length === 0) {
    return (
      <Text
        size="sm"
        color="muted"
        className="py-8 text-center"
        text="speed_unavailable"
      />
    );
  }
  return (
    <div className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 lg:flex-row lg:divide-x lg:divide-y-0">
      {columns.map((column) => (
        <SpeedColumn key={column.title} data={column} device={device} />
      ))}
    </div>
  );
}

const DEVICE_TABS: SelectOption<SpeedDevice>[] = [
  { value: 'DESKTOP', icon: DesktopIcon },
  { value: 'MOBILE', icon: MobileIcon },
];

export function SiteSpeedCard() {
  const [device, setDevice] = useState<SpeedDevice>('DESKTOP');
  const { report, loading, error, connectPrompt } = useSiteSpeed();

  const metrics = report ? extractDeviceMetrics(report[device]) : null;
  const columns: SpeedColumnData[] = metrics
    ? [
        computeColumn(
          'load_time',
          metrics.loadTimeSeconds,
          metrics.isFallback,
          device,
        ),
        computeColumn(
          'interactivity',
          metrics.interactivityMs,
          metrics.isFallback,
          device,
        ),
        computeColumn(
          'visual_stability',
          metrics.visualStability,
          metrics.isFallback,
          device,
        ),
      ]
    : [];

  return (
    <div className={cn(CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-4">
        <CardLabel hint="site_speed_hint" text="site_speed" />
        <Tabs<SpeedDevice>
          variant="control"
          options={DEVICE_TABS}
          selected={
            DEVICE_TABS.find((tab) => tab.value === device) ?? DEVICE_TABS[0]
          }
          onChange={(option) => setDevice(option.value)}
        />
      </div>
      <Text size="sm" color="muted" text="site_speed_intro" />

      <SpeedBody
        loading={loading}
        error={error}
        connectPrompt={connectPrompt}
        columns={columns}
        device={device}
      />
    </div>
  );
}
