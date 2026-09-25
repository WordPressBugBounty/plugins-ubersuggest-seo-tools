import { Button, Text } from '@ui';
import { useEffect, useRef, useState } from 'react';

import { EditIcon, RefreshIcon } from '../../../../icons';
import type { PreviewRow } from '../../types';
import { CopyButton } from './copy-button';
import { SourceBadge } from './source-badge';
import { SuggestionPanel } from './suggestion-panel';

/**
 * The generated suggestion: apply it (or copy, on pages with no editable post),
 * edit it in place, or regenerate. Owns the edit mode, like the dashboard's
 * success-state this mirrors.
 */
export function SuccessState({
  row,
  applying,
  blocked,
  canApply,
  maxChars,
  onApply,
  onEdit,
  onRegenerate,
}: {
  row: PreviewRow;
  applying: boolean;
  /** Out of credits: the suggestion still shows, but Regenerate is disabled. */
  blocked: boolean;
  canApply: boolean;
  maxChars: number;
  onApply: (ref: string) => void;
  onEdit: (ref: string, value: string) => void;
  onRegenerate: (ref: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the edit field when the user enters edit mode — the accessible
  // equivalent of autoFocus (focus in response to an action, not on mount).
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(row.after ?? '');
    setEditing(true);
  };
  const saveEdit = () => {
    onEdit(row.ref, draft.trim());
    setEditing(false);
  };

  const suggestionLength = (row.after ?? '').length;
  // Per-row override: a crawl-flagged page with no editable post behind it
  // (row.applyable === false) is copy-only even inside a fixable issue.
  const rowCanApply = canApply && row.applyable !== false;

  return (
    <SuggestionPanel
      headerRight={
        <div className="flex items-center gap-2">
          {/* Only when the suggestion did NOT come from the model: the
              panel already says "AI Suggestion", so an AI badge next to it
              would be redundant, while "Edited" and "Fallback" are the
              cases where that heading alone would be misleading. */}
          {row.source !== 'ai' && <SourceBadge source={row.source} />}
          <Text
            size="xs"
            weight="medium"
            className={
              suggestionLength > maxChars ? 'text-red-600' : 'text-zinc-500'
            }
            text="characters_used"
            translationConfig={{
              translationVariables: [suggestionLength, maxChars],
            }}
          />
        </div>
      }
    >
      <div className="flex min-h-20 flex-col justify-between gap-2">
        {editing ? (
          <>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              // bg-white: the panel behind it is a gradient, which a
              // transparent field would show through.
              className="w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <Button variant="primary-solid" size="sm" onClick={saveEdit}>
                <Text size="sm" className="text-white" text="save" />
              </Button>
              <Button
                variant="neutral-outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                <Text size="sm" text="cancel" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <Text className="break-words text-zinc-900">{row.after}</Text>
            <div className="flex flex-wrap items-center gap-3">
              {rowCanApply ? (
                <Button
                  variant="primary-solid"
                  size="sm"
                  loading={applying}
                  disabled={applying}
                  onClick={() => onApply(row.ref)}
                >
                  <Text
                    size="xs"
                    weight="medium"
                    className="text-white"
                    text={applying ? 'applying' : 'apply'}
                  />
                </Button>
              ) : (
                <CopyButton value={row.after ?? ''} />
              )}
              <Button variant="neutral-solid" size="sm" onClick={startEdit}>
                <EditIcon size={20} className="text-zinc-700" />
                <Text size="xs" weight="medium" text="edit" />
              </Button>
              <Button
                variant="neutral-solid"
                size="sm"
                onClick={() => !blocked && onRegenerate(row.ref)}
                className={blocked ? 'cursor-not-allowed opacity-50' : ''}
              >
                <RefreshIcon size={20} className="text-zinc-700" />
                <Text size="xs" weight="medium" text="regenerate" />
              </Button>
            </div>
          </>
        )}
      </div>
    </SuggestionPanel>
  );
}
