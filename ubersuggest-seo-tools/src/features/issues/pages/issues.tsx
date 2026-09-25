import type { SelectOption } from '@ui';
import { cn, Tabs, Text, translate } from '@ui';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiGet } from '../../../api';
import { CARD } from '../../../ui/card';
import {
  ConnectAccountCard,
  type ConnectPrompt,
  connectPromptFrom,
  type NotConnectedFields,
} from '../../../ui/connect-account-card';
import { LoadingCard } from '../../../ui/loading-card';
import { PageHeader } from '../../../ui/page-header';
import { IssueRow } from '../components/issues-table';
import {
  type HeldDrawer,
  isResolved,
  partitionIssues,
} from '../partition-issues';
import type { Issue } from '../types';

// How long a just-fixed row lingers (green, fading) in the to-fix tab before it
// moves to the Fixed tab — matches the row-exit-fade animation in styles.css.
const ROW_EXIT_MS = 1400;

type TabId = 'to_fix' | 'fixed';

export default function Issues() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectPrompt, setConnectPrompt] = useState<ConnectPrompt | null>(
    null,
  );
  const [tab, setTab] = useState<TabId>('to_fix');
  // Issues that JUST became resolved: they linger in the to-fix tab while the
  // exit fade plays, then move to the Fixed tab (same pattern as the UBS
  // dashboard's next-actions Done flow).
  const [exitingIds, setExitingIds] = useState<string[]>([]);
  // The row whose drawer is open. Fixing the LAST page of an issue resolves it,
  // which would move the row to the Fixed tab and unmount the drawer mid-use —
  // so a held row stays put (and green) until the drawer closes.
  const [held, setHeld] = useState<HeldDrawer>(null);
  // Mirror for load(): it runs from poll/apply callbacks whose closures would
  // otherwise read a stale `held`.
  const heldRef = useRef<HeldDrawer>(null);
  const previousStates = useRef<Map<string, boolean>>(new Map());
  const exitTimers = useRef<number[]>([]);

  const load = useCallback(() => {
    apiGet<
      NotConnectedFields & {
        issues?: Issue[];
        error?: string;
        pending?: boolean;
      }
    >('issues')
      .then((data) => {
        const prompt = connectPromptFrom(data);
        if (prompt) {
          setConnectPrompt(prompt);
          return;
        }
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.pending) {
          setError(translate('crawl_in_progress'));
          return;
        }
        setError(null); // a previous 'crawl in progress' / failure is over
        const fresh = data.issues ?? [];
        // Rows that flipped to resolved since the last load get the exit fade —
        // except a held one, whose fade waits for its drawer to close.
        const justFixed = fresh
          .filter(
            (issue) =>
              isResolved(issue) &&
              previousStates.current.get(issue.id) === false &&
              issue.id !== heldRef.current?.id,
          )
          .map((issue) => issue.id);
        previousStates.current = new Map(
          fresh.map((issue) => [issue.id, isResolved(issue)]),
        );
        if (justFixed.length > 0) {
          setExitingIds((ids) => Array.from(new Set([...ids, ...justFixed])));
          exitTimers.current.push(
            window.setTimeout(
              () =>
                setExitingIds((ids) =>
                  ids.filter((id) => !justFixed.includes(id)),
                ),
              ROW_EXIT_MS,
            ),
          );
        }
        setIssues(fresh);
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  useEffect(() => {
    load();
    return () => {
      exitTimers.current.forEach((id) => window.clearTimeout(id));
    };
  }, [load]);

  // A drawer opened on an unresolved row holds it in the To fix tab even once
  // it resolves; closing releases it, and the exit fade runs then.
  const releaseDrawer = useCallback(() => {
    const releasedId = heldRef.current?.id;
    const wasUnresolved = heldRef.current?.wasUnresolved === true;
    heldRef.current = null;
    setHeld(null);
    if (
      releasedId == null ||
      !wasUnresolved ||
      previousStates.current.get(releasedId) !== true
    ) {
      return;
    }
    setExitingIds((ids) => Array.from(new Set([...ids, releasedId])));
    exitTimers.current.push(
      window.setTimeout(
        () => setExitingIds((ids) => ids.filter((id) => id !== releasedId)),
        ROW_EXIT_MS,
      ),
    );
  }, []);

  const handleDrawerToggle = useCallback(
    (issue: Issue, open: boolean) => {
      if (!open) {
        releaseDrawer();
        return;
      }
      const entry = { id: issue.id, wasUnresolved: !isResolved(issue) };
      heldRef.current = entry;
      setHeld(entry);
    },
    [releaseDrawer],
  );

  const { toFix: toFixRows, fixed: fixedRows } = partitionIssues(
    issues ?? [],
    exitingIds,
    held,
  );

  // Stable option identities: the DS Tabs re-measures its sliding indicator when
  // its props change, so churning these every render delays the orange bar.
  const tabOptions: SelectOption<TabId>[] = useMemo(
    () => [
      {
        name: translate('tab_to_fix'),
        value: 'to_fix',
        badge: { value: toFixRows.length },
      },
      {
        name: translate('fixed'),
        value: 'fixed',
        badge: { value: fixedRows.length },
      },
    ],
    [toFixRows.length, fixedRows.length],
  );
  const selectedTab = useMemo(
    () => tabOptions.find((option) => option.value === tab) ?? tabOptions[0],
    [tabOptions, tab],
  );
  // Swap the table body a beat AFTER the tab header paints: the indicator moves
  // in the urgent render, the (heavier) row list follows in the deferred one.
  const deferredTab = useDeferredValue(tab);
  const visibleRows = deferredTab === 'fixed' ? fixedRows : toFixRows;

  if (connectPrompt) {
    return <ConnectAccountCard {...connectPrompt} />;
  }

  return (
    <div className="mx-2 flex flex-col gap-6">
      <PageHeader
        title="nav_seo_issues"
        hint="issues_discovered_hint"
        tabs={
          issues && (
            // No `variant`: the DS default is the underlined bar the dashboard
            // uses (bottom hairline + sliding orange indicator). We used to
            // force `button`, which boxed the tabs in a bordered card.
            <Tabs
              options={tabOptions}
              selected={selectedTab}
              onChange={(option) => setTab(option.value)}
              shouldColorActiveBadge
            />
          )
        }
      />

      {error && (
        <Text
          color="muted"
          text="couldnt_load_issues"
          translationConfig={{ translationVariables: [error] }}
        />
      )}
      {!error && !issues && <LoadingCard title="loading_issues" />}

      {issues && (
        <div className={cn(CARD, 'overflow-hidden')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-zinc-200 border-b text-left text-xs text-zinc-500 uppercase tracking-wide">
                <Text
                  as="th"
                  className="px-5 py-3 font-medium"
                  text="col_opportunity"
                />
                <Text
                  as="th"
                  className="w-28 px-3 py-3 font-medium"
                  text="col_impact"
                />
                <Text
                  as="th"
                  className="w-28 px-3 py-3 font-medium"
                  text="col_effort"
                />
                <Text
                  as="th"
                  className="w-44 px-5 py-3 text-right font-medium"
                  text="col_actions"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <Text
                      color="muted"
                      text={
                        deferredTab === 'fixed' ? 'no_fixed_yet' : 'no_issues'
                      }
                    />
                  </td>
                </tr>
              ) : (
                visibleRows.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    onChanged={load}
                    exiting={exitingIds.includes(issue.id)}
                    justFixed={
                      held?.id === issue.id &&
                      held.wasUnresolved &&
                      isResolved(issue)
                    }
                    onDrawerToggle={(open) => handleDrawerToggle(issue, open)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
