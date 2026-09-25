import { Button, Text } from '@ui';

import { useClipboard } from '../../../../hooks/use-clipboard';
import { CheckIcon, CopyIcon } from '../../../../icons';

// Copy-to-clipboard with a short "Copied!" confirmation — the manual-issue
// counterpart of Apply (the user takes the suggestion where the fix lives).
//
// Neutral, not primary, to sit level with Edit and Regenerate the way the
// dashboard's suggestion panel does: copying commits nothing, so it doesn't
// earn the emphasis Apply gets.
export function CopyButton({ value }: { value: string }) {
  const { copied, copy } = useClipboard();
  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <Button
      variant="neutral-solid"
      size="sm"
      onClick={() => {
        void copy(value);
      }}
    >
      <Icon size={20} className={copied ? 'text-green-600' : 'text-zinc-700'} />
      <Text size="xs" weight="medium" text={copied ? 'copied' : 'copy'} />
    </Button>
  );
}
