import { Button, ModalDialog, Text, type TranslationKeys } from '@ui';

/**
 * "Undo this fix?" — the confirmation both undo surfaces share, so the wording
 * and the nothing-to-restore branch cannot drift between them.
 */
export function UndoFixDialog({
  open,
  restores,
  restoredValue,
  emptyBodyKey = 'undo_fix_body_empty',
  zIndex,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /**
   * Does the undo write a value back, or clear the field? Both callers decide
   * from `previous_raw`, never from `restoredValue` — that one only displays,
   * and can be a rendered fallback or the drawer's "(none)" placeholder.
   */
  restores: boolean;
  /** The value to show as coming back. Ignored when `restores` is false. */
  restoredValue: string;
  /** What an undo with nothing to restore does: H1 removes a heading, the rest clear a field. */
  emptyBodyKey?: TranslationKeys;
  /** Set only by a caller inside the drawer, whose stacking level would bury the DS default. */
  zIndex?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalDialog
      isOpen={open}
      onClose={onClose}
      variant="center"
      maxSize="max-w-md"
      zIndex={zIndex}
      content={
        <div className="flex flex-col gap-3 text-center">
          <Text
            as="p"
            size="lg"
            weight="bold"
            className="text-zinc-950"
            text="undo_fix_title"
          />
          {restores ? (
            <>
              <Text as="p" color="muted" text="undo_fix_body" />
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <Text size="sm" className="text-zinc-700">
                  {restoredValue}
                </Text>
              </div>
            </>
          ) : (
            <Text as="p" color="muted" text={emptyBodyKey} />
          )}
        </div>
      }
      footer={
        <div className="flex justify-center gap-3">
          <Button variant="neutral-outline" onClick={onClose} text="cancel" />
          <Button
            variant="primary-solid"
            onClick={() => {
              onClose();
              onConfirm();
            }}
            text="undo_fix"
          />
        </div>
      }
    />
  );
}
