import { Button, Heading, Text } from '@ui';

import { RefreshIcon } from '../../../icons';

/**
 * Where a cancel lands when there is no report to show: the user stopped the
 * first crawl this site ever ran (none exists), or the stop succeeded but the
 * fallback read failed (one may exist, it just couldn't be fetched) — which is
 * why the copy claims only "no report to show", never "never crawled".
 *
 * Reachable only from a cancel — every other path either has a report or is
 * still crawling. The one action it offers is starting a crawl again, because
 * that is the only thing that can fill this screen.
 */
export function CrawlCancelled({
  onRecrawl,
  recrawling,
}: {
  onRecrawl: () => void;
  recrawling: boolean;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="mx-auto flex w-full max-w-140 flex-col items-center gap-4 rounded-2xl bg-white px-6 py-10 text-center shadow-lg">
        <Heading level={2} text="crawl_cancelled_title" />
        <Text size="sm" color="muted" text="crawl_cancelled_body" />
        <Button
          variant="primary-solid"
          onClick={onRecrawl}
          disabled={recrawling}
        >
          <RefreshIcon size={16} />
          <Text
            size="sm"
            className="text-white"
            text={recrawling ? 'recrawling' : 'recrawl'}
          />
        </Button>
      </div>
    </div>
  );
}
