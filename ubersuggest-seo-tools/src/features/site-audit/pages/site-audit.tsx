import { Text } from '@ui';

import { ConnectAccountCard } from '../../../ui/connect-account-card';
import { LoadingCard } from '../../../ui/loading-card';
import { PageHeader } from '../../../ui/page-header';
import { AuditProvider } from '../audit-context';
import { CrawlCancelled } from '../components/crawl-cancelled';
import { CrawlControls } from '../components/crawl-controls';
import { CrawlProgress } from '../components/crawl-progress';
import { NeilPanel } from '../components/neil-panel';
import { OverviewBoxes } from '../components/overview-boxes';
import { PagesCrawledCard } from '../components/pages-crawled-card';
import { SiteSpeedCard } from '../components/site-speed-card';
import { TopIssuesCard } from '../components/top-issues-card';
import { useSiteAudit } from '../hooks/use-site-audit';

export default function SiteAudit() {
  const {
    audit,
    error,
    connectPrompt,
    reloading,
    reload,
    cancel,
    cancelling,
    cancelFailed,
    noReport,
    progress,
    takingLong,
  } = useSiteAudit();

  if (connectPrompt) {
    return <ConnectAccountCard {...connectPrompt} />;
  }
  if (noReport && !audit) {
    return <CrawlCancelled onRecrawl={reload} recrawling={reloading} />;
  }
  if (error && !audit) {
    return (
      <div className="p-6">
        <Text
          color="muted"
          text="couldnt_load_audit"
          translationConfig={{ translationVariables: [error] }}
        />
      </div>
    );
  }
  if (progress) {
    return (
      <CrawlProgress
        count={progress.count}
        takingLong={takingLong}
        cancelling={cancelling}
        cancelFailed={cancelFailed}
        onCancel={cancel}
      />
    );
  }
  if (!audit) {
    return <LoadingCard title="loading_audit" />;
  }

  return (
    <AuditProvider audit={audit} reload={reload} reloading={reloading}>
      <div className="mx-2 flex flex-col gap-6">
        <PageHeader title="nav_site_audit" />
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <Text size="sm" className="text-red-700" text="crawl_failed" />
          </div>
        )}
        <CrawlControls />
        <div className="flex flex-col gap-4">
          <OverviewBoxes />
          <NeilPanel />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <PagesCrawledCard />
            </div>
            <div className="lg:col-span-2">
              <TopIssuesCard />
            </div>
          </div>
          <SiteSpeedCard />
        </div>
      </div>
    </AuditProvider>
  );
}
