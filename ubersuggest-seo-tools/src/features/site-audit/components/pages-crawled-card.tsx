import { cn, Text } from '@ui';

import { formatNumber } from '../../../lib/format';
import { CARD, CardFooterLink, CardLabel } from '../../../ui/card';
import { useAudit } from '../audit-context';

const HEALTH_SEGMENTS = [
  { key: 'successful', chip: 'bg-emerald-400' },
  { key: 'redirected', chip: 'bg-emerald-200' },
  { key: 'broken', chip: 'bg-amber-400' },
  { key: 'blocked', chip: 'bg-rose-400' },
] as const;

export function PagesCrawledCard() {
  'use memo';
  const audit = useAudit();
  return (
    <div className={cn(CARD, 'flex h-full flex-col')}>
      <div className="flex flex-col gap-2 border-zinc-100 border-b p-6">
        <CardLabel hint="pages_crawled_hint" text="pages_crawled_title" />
        <Text size="3xl" weight="bold" className="text-zinc-950">
          {formatNumber(audit.pagesCrawled)}
        </Text>
        <Text
          size="sm"
          color="muted"
          text="pages_crawled_summary"
          translationConfig={{
            translationVariables: [
              formatNumber(audit.pagesCrawled - audit.blocked),
              formatNumber(audit.blocked),
            ],
            boldClassName: 'font-semibold text-zinc-700',
          }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6">
        <CardLabel hint="page_status_hint" text="page_status" />
        <div className="flex max-w-xs flex-col gap-2">
          {HEALTH_SEGMENTS.map((segment) => (
            <div
              key={segment.key}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <span className={cn('h-3 w-3 rounded-sm', segment.chip)} />
                <Text
                  size="sm"
                  className="text-zinc-700"
                  text={`status_${segment.key}`}
                />
              </div>
              <Text size="sm" weight="semibold">
                {formatNumber(audit.pageStatus[segment.key])}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <CardFooterLink text="see_all_pages" />
    </div>
  );
}
