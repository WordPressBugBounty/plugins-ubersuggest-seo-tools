// Shape returned by GET /ubs-seo/v1/audit (see UBS_SEO_Rest::audit_to_ui).
export type Audit = {
  domain: string;
  lastCrawl: string;
  // Organic traffic / keywords / backlinks come from the separate
  // /overview-metrics endpoint (see use-overview-metrics.ts).
  overview: {
    seoScore: number;
  };
  pagesCrawled: number;
  blocked: number;
  pageStatus: {
    successful: number;
    redirected: number;
    broken: number;
    blocked: number;
  };
  totalIssues: number;
  // `name` is the server's English label, kept only as the fallback for an issue
  // ID the catalog has no string for — render through src/i18n/issue-text.ts.
  topIssues: { id: string; count: number; name: string }[];
};

export type Rating = 'great' | 'needs_improvement' | 'poor';
