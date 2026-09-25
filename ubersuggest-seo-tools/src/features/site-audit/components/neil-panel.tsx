import { cn, Text } from '@ui';

import { NeilHandsUpIllustration } from '../../../assets/neil-hands-up-illustration';
import { formatNumber } from '../../../lib/format';
import { useAudit } from '../audit-context';

export function NeilPanel() {
  const audit = useAudit();
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4',
      )}
    >
      <NeilHandsUpIllustration className="h-12 w-[88px] shrink-0 object-contain" />
      <Text
        size="base"
        className="text-zinc-700"
        text="neil_panel_summary"
        translationConfig={{
          translationVariables: [formatNumber(audit.pagesCrawled)],
          boldClassName: 'font-semibold text-zinc-900',
        }}
      />
    </div>
  );
}
