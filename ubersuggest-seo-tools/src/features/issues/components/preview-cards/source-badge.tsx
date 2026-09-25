import { Text } from '@ui';

const BADGE = 'w-fit rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase';

// Where a suggestion came from: backend AI, or a user edit.
export function SourceBadge({ source }: { source: string | null }) {
  if (source === 'ai') {
    return (
      <Text
        size="xs"
        className={`${BADGE} bg-emerald-100 text-emerald-700`}
        text="badge_ai"
      />
    );
  }
  if (source === 'edited') {
    return (
      <Text
        size="xs"
        className={`${BADGE} bg-indigo-100 text-indigo-700`}
        text="badge_edited"
      />
    );
  }
  return null;
}
