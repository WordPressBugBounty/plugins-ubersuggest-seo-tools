import { Button, Text } from '@ui';

import { LoadingCard } from '../../../../ui/loading-card';

/**
 * Crawl-in-progress screen: the shared LoadingCard (spinner + rotating tips)
 * titled "Scanning your site…", with the live pages-crawled count and the
 * long-crawl reassurance as its subline.
 *
 * This screen replaces the whole page while a crawl runs, so it is also the
 * only place the user can call one off — hence the Cancel button here rather
 * than next to Recrawl in {@link CrawlControls}.
 */
export function CrawlProgress({
  count,
  takingLong,
  cancelling,
  cancelFailed,
  onCancel,
}: {
  count: number;
  takingLong: boolean;
  cancelling: boolean;
  /** The stop call failed and the crawl is still running. */
  cancelFailed: boolean;
  onCancel: () => void;
}) {
  return (
    <LoadingCard
      title="scanning_site"
      subline={
        <>
          {count > 0 && (
            <Text
              size="sm"
              color="muted"
              text="crawling_progress"
              translationConfig={{ translationVariables: [count] }}
            />
          )}
          {takingLong && (
            <Text size="sm" color="muted" text="crawl_still_running" />
          )}
          {cancelFailed && (
            <Text
              size="sm"
              className="text-red-700"
              text="cancel_crawl_failed"
            />
          )}
          <Button
            variant="neutral-outline"
            onClick={onCancel}
            disabled={cancelling}
            text={cancelling ? 'cancelling_crawl' : 'cancel_crawl'}
          />
        </>
      }
    />
  );
}
