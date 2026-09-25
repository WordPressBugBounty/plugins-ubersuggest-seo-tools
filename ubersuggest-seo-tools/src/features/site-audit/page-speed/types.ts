// Raw Site Speed shape returned by GET /ubs-seo/v1/pagespeed, which proxies
// november's pagespeed_audit `{ done, report }`. Extra keys are ignored — we
// read only the few fields the card needs (mirrors page-speed.schema.ts).

export type SpeedDevice = 'DESKTOP' | 'MOBILE';

export type LighthouseAudit = {
  numericValue?: number;
  numericUnit?: string;
};

export type OriginMetric = {
  percentile?: number;
  category?: string;
};

export type DeviceReport = {
  status?: string; // 'ok' | 'pending' | '<error>'
  originData?: {
    metrics?: Record<string, OriginMetric>;
    overall_category?: string;
  };
  labData?: Record<string, LighthouseAudit>;
};

export type PageSpeedReport = Partial<Record<SpeedDevice, DeviceReport>>;

// Cleaned per-device metrics the card renders. `isFallback` = Lighthouse lab
// data (TBT) was used because CrUX field data (FID) was incomplete; it switches
// the interactivity thresholds (see speed-limits.ts).
export type DeviceMetrics = {
  loadTimeSeconds: number;
  interactivityMs: number;
  visualStability: number;
  isFallback: boolean;
};
