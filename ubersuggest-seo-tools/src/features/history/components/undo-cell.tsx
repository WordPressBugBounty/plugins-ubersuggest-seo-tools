import { Button, Text, translate } from '@ui';
import { useState } from 'react';

import { translateDynamic } from '../../../i18n/translate-dynamic';
import { UndoFixDialog } from '../../../ui/undo-fix-dialog';
import type { RevertFailure } from '../hooks/use-fix-history';
import type { HistoryRecord } from '../services/fix-history';

/**
 * The refusal as words, falling back to the generic key rather than rendering
 * `history_no_undo_<code>` when PHP emits a code the catalogue lacks.
 */
function refusalText(code: string): string {
  const key = `history_no_undo_${code}`;
  const translated = translateDynamic(key);
  return translated === key
    ? translate('history_no_undo_unsupported_record')
    : translated;
}

/**
 * The Undo cell: the button, the reason it is gone, or nothing where the row's
 * "not live" chip already explains the absence. Owns the confirmation state,
 * since the dialog and its trigger are one thing.
 */
export function UndoCell({
  record,
  reverting,
  failure,
  onRevert,
}: {
  record: HistoryRecord;
  reverting: boolean;
  failure?: RevertFailure['code'];
  onRevert: (id: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const refusal = failure ?? record.revertRefusal;
  // The request never landed, so the record is unchanged and the click stays.
  const retryable = failure === 'request_failed';

  if (retryable || refusal === null || refusal === undefined) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="neutral-outline"
          size="sm"
          loading={reverting}
          disabled={reverting}
          onClick={() => setConfirming(true)}
          data-testid="history-undo"
        >
          <Text size="xs" weight="medium" className="uppercase tracking-wide">
            {translate('undo_fix')}
          </Text>
        </Button>

        <UndoFixDialog
          open={confirming}
          restores={record.restores}
          restoredValue={record.before}
          emptyBodyKey={
            record.field === 'h1' ? 'undo_fix_body_h1' : 'undo_fix_body_empty'
          }
          onClose={() => setConfirming(false)}
          onConfirm={() => onRevert(record.id)}
        />
        {retryable && (
          <Text size="xs" className="text-red-700" text="history_undo_failed" />
        )}
      </div>
    );
  }

  // Silent only where the "not live" chip already says it; a refused click, or
  // a live value a later write repeated, both still need the reason.
  if (failure === undefined && refusal === 'superseded' && record.stale) {
    return (
      <Text size="xs" color="muted">
        —
      </Text>
    );
  }

  return (
    <Text size="xs" color="muted">
      {refusalText(refusal)}
    </Text>
  );
}
