import { Button, Heading, Text, translate } from '@ui';

import { InfoIcon, RefreshIcon } from '../../../icons';
import { useAudit, useReload } from '../audit-context';

export function CrawlControls() {
  const audit = useAudit();
  const { reload, reloading } = useReload();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Heading level={1} text="nav_site_audit" />
        <span className="text-zinc-400" title={translate('seo_analyzer')}>
          <InfoIcon size={16} />
        </span>
        <Text size="2xl" weight="bold" className="text-zinc-950">
          : {audit.domain}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Text
          size="xs"
          color="muted"
          className="whitespace-pre-line text-right"
          text="last_crawl_at"
          translationConfig={{
            translationVariables: [audit.lastCrawl],
            boldClassName: 'font-semibold text-zinc-700',
          }}
        />
        <Button
          variant="primary-solid"
          size="default"
          onClick={reload}
          loading={reloading}
        >
          {!reloading && <RefreshIcon size={16} />}
          <Text size="sm" className="text-current" text="recrawl" />
        </Button>
      </div>
    </div>
  );
}
