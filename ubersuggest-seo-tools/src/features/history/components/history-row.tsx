import { cn, Text, type TranslationKeys, translate } from '@ui';

import { issueName } from '../../../i18n/issue-text';
import { ExternalLinkIcon } from '../../../icons';
import { formatSiteDateTime } from '../../../lib/format';
import type { RevertFailure } from '../hooks/use-fix-history';
import type {
  HistoryField,
  HistoryRecord,
  HistorySource,
} from '../services/fix-history';
import { UndoCell } from './undo-cell';

// Maps, not `history_field_${field}`: the sets are closed on the PHP side, so
// a missing key fails to compile instead of rendering itself into the cell.
const FIELD_LABELS: Record<HistoryField, TranslationKeys> = {
  title: 'history_field_title',
  description: 'history_field_description',
  h1: 'history_field_h1',
  home_title: 'history_field_home_title',
  home_description: 'history_field_home_description',
};

const SOURCE_LABELS: Record<HistorySource, TranslationKeys> = {
  ai: 'history_source_ai',
  edited: 'history_source_edited',
  history: 'history_source_history',
};

const ACTION_LABELS: Record<HistoryRecord['action'], TranslationKeys> = {
  apply: 'history_action_apply',
  revert: 'history_action_revert',
};

/** A diff side. '' is a real state, so it is named rather than left blank. */
function DiffValue({
  value,
  tone,
}: {
  value: string;
  tone: 'before' | 'after';
}) {
  const empty = value === '';
  return (
    <Text
      size="xs"
      className={cn(
        'block rounded px-1.5 py-0.5',
        empty && 'italic opacity-70',
        tone === 'before'
          ? 'bg-red-50 text-red-800 line-through'
          : 'bg-emerald-50 text-emerald-800',
      )}
    >
      {empty ? translate('history_value_empty') : value}
    </Text>
  );
}

type HistoryRowProps = {
  record: HistoryRecord;
  /** App locale, for the timestamp's wording. */
  locale: string;
  reverting: boolean;
  /** Refusal code from an Undo click that did not take, if this row's. */
  failure?: RevertFailure['code'];
  onRevert: (id: number) => void;
  onFilterPage: (ref: string, label: string) => void;
};

/**
 * One write, as the History tab lists it. Undo asks first, through the same
 * {@link UndoFixDialog} the issues drawer uses. Undoing an Undo is legal and
 * lands as the next row in this same list.
 */
export function HistoryRow({
  record,
  locale,
  reverting,
  failure,
  onRevert,
  onFilterPage,
}: HistoryRowProps) {
  const pageLabel = record.pageTitle || record.pageUrl;
  return (
    <tr className="border-zinc-100 border-t align-top">
      <td className="whitespace-nowrap py-3 pr-4">
        <Text size="xs" color="muted" title={`${record.appliedAt} UTC`}>
          {formatSiteDateTime(record.appliedAtSite, locale)}
        </Text>
      </td>

      <td className="max-w-3xs py-3 pr-4">
        {/* The title IS the page filter; a dropdown of every logged page
            would be unbounded. */}
        <button
          type="button"
          onClick={() => onFilterPage(record.ref, pageLabel)}
          className="block max-w-full truncate text-left hover:underline"
        >
          <Text size="sm" weight="medium">
            {pageLabel}
          </Text>
        </button>
        {record.pageExists && record.pageUrl !== '' ? (
          <a
            href={record.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900"
          >
            <span className="min-w-0 truncate underline">{record.pageUrl}</span>
            <ExternalLinkIcon size={12} className="shrink-0 text-zinc-500" />
          </a>
        ) : (
          <Text
            size="xs"
            color="muted"
            className="block"
            text="history_page_deleted"
          />
        )}
      </td>

      <td className="py-3 pr-4">
        <Text size="sm">{issueName(record.issueId, record.issueId)}</Text>
        <Text
          size="xs"
          color="muted"
          className="block"
          text={FIELD_LABELS[record.field]}
        />
      </td>

      <td className="py-3 pr-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Text
            size="xs"
            weight="medium"
            className={cn(
              'uppercase tracking-wide',
              record.action === 'revert' ? 'text-zinc-500' : 'text-orange-700',
            )}
            text={ACTION_LABELS[record.action]}
          />
          {/* A replaced fix still shows the value it wrote, and the row that
              superseded it is a separate line the eye can miss. */}
          {record.stale && (
            <Text
              size="xs"
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 uppercase tracking-wide"
              text="history_stale"
            />
          )}
        </div>
        <div
          className={cn(
            'flex max-w-md flex-col gap-1',
            record.stale && 'opacity-50',
          )}
        >
          <DiffValue value={record.before} tone="before" />
          <DiffValue value={record.after} tone="after" />
        </div>
      </td>

      <td className="py-3 pr-4">
        <Text size="sm">
          {record.user || translate('history_user_unknown')}
        </Text>
        <Text size="xs" color="muted" className="block">
          {`${translate(SOURCE_LABELS[record.source])} · ${record.integration}`}
        </Text>
      </td>

      <td className="py-3 text-right">
        <UndoCell
          record={record}
          reverting={reverting}
          failure={failure}
          onRevert={onRevert}
        />
      </td>
    </tr>
  );
}
