import {
  cn,
  Input,
  LoadingSpinner,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  translate,
} from '@ui';
import { useState } from 'react';

import { config } from '../../../api';
import { issueName } from '../../../i18n/issue-text';
import { CloseIcon } from '../../../icons';
import { CARD } from '../../../ui/card';
import { PageHeader } from '../../../ui/page-header';
import { HistoryRow } from '../components/history-row';
import { useFixHistory } from '../hooks/use-fix-history';

/** Radix Select has no empty value, so "all types" needs a sentinel. */
const ALL_TYPES = 'all';

const COLUMNS = [
  'history_col_when',
  'history_col_page',
  'history_col_issue',
  'history_col_change',
  'history_col_by',
] as const;

/**
 * The audit log of everything this plugin wrote: applies and the reverts that
 * undid them, newest first. Read from the plugin's own table, not the backend,
 * so a fix stays listed after the account disconnects.
 */
export default function FixHistory() {
  const {
    records,
    total,
    perPage,
    issueTypes,
    error,
    issue,
    pageRef,
    search,
    page,
    setIssue,
    setPageRef,
    setSearch,
    setPage,
    revert,
    revertingId,
    revertFailure,
  } = useFixHistory();

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasActiveFilter = issue !== '' || pageRef !== '' || search !== '';
  // Remembered from the row that set it: a search excluding that page empties
  // the lookup, and the chip would fall back to a bare post id.
  const [pageFilterLabel, setPageFilterLabel] = useState('');

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <PageHeader title="nav_history" hint="history_hint" />

      <div className={cn(CARD, 'flex flex-col gap-4 p-4 sm:p-6')}>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={translate('history_search_placeholder')}
            className="w-full sm:w-80"
          />
          <Select
            value={issue === '' ? ALL_TYPES : issue}
            onValueChange={(value) =>
              setIssue(value === ALL_TYPES ? '' : value)
            }
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>
                {translate('history_filter_all_types')}
              </SelectItem>
              {issueTypes.map((issueId) => (
                <SelectItem key={issueId} value={issueId}>
                  {issueName(issueId, issueId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pageRef !== '' && (
            <button
              type="button"
              onClick={() => {
                setPageRef('');
                setPageFilterLabel('');
              }}
              className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 hover:bg-zinc-200"
            >
              <Text size="xs" weight="medium" className="max-w-3xs truncate">
                {pageFilterLabel || pageRef}
              </Text>
              <CloseIcon size={12} className="shrink-0 text-zinc-500" />
            </button>
          )}
        </div>

        {error !== null && (
          <Text size="sm" className="text-red-700">
            {error}
          </Text>
        )}

        {records === null && error === null && (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        )}

        {records !== null && records.length === 0 && (
          <Text
            size="sm"
            color="muted"
            text={hasActiveFilter ? 'history_empty_filtered' : 'history_empty'}
          />
        )}

        {records !== null && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {COLUMNS.map((column) => (
                    <th key={column} className="pr-4 pb-2 font-medium">
                      <Text
                        size="xs"
                        color="muted"
                        className="uppercase tracking-wide"
                        text={column}
                      />
                    </th>
                  ))}
                  {/* The Undo column's heading would say what its buttons say. */}
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <HistoryRow
                    key={record.id}
                    record={record}
                    locale={config().lang}
                    reverting={revertingId === record.id}
                    failure={
                      revertFailure?.id === record.id
                        ? revertFailure.code
                        : undefined
                    }
                    onRevert={revert}
                    onFilterPage={(ref, label) => {
                      setPageRef(ref);
                      setPageFilterLabel(label);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            variant="lg"
            className="w-full justify-start border-none pl-0 sm:w-auto"
            numberOfPages={totalPages}
            totalItems={total}
            pageSize={perPage}
            page={page}
            onClickPage={setPage}
            onClickNext={() => setPage(Math.min(totalPages, page + 1))}
            onClickBack={() => setPage(Math.max(1, page - 1))}
          />
        )}
      </div>
    </div>
  );
}
