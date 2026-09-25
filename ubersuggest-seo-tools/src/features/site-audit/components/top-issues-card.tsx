import { cn, Text, translate } from '@ui';

import { issueDescription } from '../../../i18n/issue-text';
import { ArrowRightIcon } from '../../../icons';
import { formatNumber } from '../../../lib/format';
import { useNav } from '../../../nav';
import { CARD, CardFooterLink, CardLabel } from '../../../ui/card';
import { useAudit } from '../audit-context';

export function TopIssuesCard() {
  'use memo';
  const audit = useAudit();
  const go = useNav();
  return (
    <div className={cn(CARD, 'flex h-full flex-col')}>
      <div className="flex flex-col gap-2 border-zinc-100 border-b p-6">
        <CardLabel hint="issues_discovered_hint" text="issues_discovered" />
        <Text size="3xl" weight="bold" className="text-zinc-950">
          {formatNumber(audit.totalIssues)}
        </Text>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-6">
        <CardLabel hint="top_seo_issues_hint" text="top_seo_issues" />
        <div className="flex flex-col">
          {audit.topIssues.map((issue) => (
            <div
              key={issue.id}
              className="flex items-center justify-between gap-3 border-zinc-100 border-b py-3 last:border-b-0"
            >
              <Text size="sm" className="text-zinc-700">
                <span className="font-semibold text-orange-600">
                  {translate('pages_count', issue.count)}
                </span>{' '}
                {issueDescription(issue.id, issue.name)}
              </Text>
              <button
                type="button"
                onClick={() => go('issues')}
                className="flex shrink-0 items-center gap-1 text-orange-600 text-sm hover:underline"
              >
                <Text
                  size="sm"
                  color="primary"
                  weight="semibold"
                  text="view_details"
                />
                <ArrowRightIcon size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <CardFooterLink onClick={() => go('issues')} text="see_all_issues" />
    </div>
  );
}
