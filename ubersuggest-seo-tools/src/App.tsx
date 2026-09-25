import { cn, Text, type TranslationKeys } from '@ui';
import { type ComponentType, useEffect, useRef, useState } from 'react';

import { config } from './api';
import FixHistory from './features/history/pages/fix-history';
import Issues from './features/issues/pages/issues';
import { LeaveReviewButton } from './features/review/components/leave-review-button';
import { ReviewPromptDialog } from './features/review/components/review-prompt-dialog';
import { useReviewPrompt } from './features/review/hooks/use-review-prompt';
import { ReviewAskContext } from './features/review/review-ask-context';
import Settings from './features/settings/pages/settings';
import SiteAudit from './features/site-audit/pages/site-audit';
import { GaugeIcon, HistoryIcon, InfoIcon, SettingsIcon } from './icons';
import { NavContext, type PageKey } from './nav';
import { type TrackedPageName, trackApp } from './tracking/app';

// Single WP menu → one iframe → in-app nav via a useState switch (no router
// dependency). Add a page = add a NAV entry + a PAGES key; no PHP change.
const PAGES: Record<PageKey, ComponentType> = {
  'site-audit': SiteAudit,
  issues: Issues,
  history: FixHistory,
  settings: Settings,
};

// Explicit map, not string-munging of the nav key: renaming a PageKey is an
// internal refactor and must not silently rename a Mixpanel dimension that
// saved reports filter on.
const PAGE_NAMES: Record<PageKey, TrackedPageName> = {
  'site-audit': 'site_audit',
  issues: 'issues',
  history: 'history',
  settings: 'settings',
};

const NAV: {
  key: PageKey;
  labelKey: TranslationKeys;
  icon: ComponentType<{ size?: number }>;
}[] = [
  { key: 'site-audit', labelKey: 'nav_site_audit', icon: GaugeIcon },
  { key: 'issues', labelKey: 'nav_seo_issues', icon: InfoIcon },
  { key: 'history', labelKey: 'nav_history', icon: HistoryIcon },
  { key: 'settings', labelKey: 'nav_settings', icon: SettingsIcon },
];

// Shows the scroll container's scrollbar thumb only while it's actively
// scrolling, fading it out 2s after the last scroll event (styled in
// styles.css via the `is-scrolling` class).
function useAutoHideScrollbar() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      element.classList.add('is-scrolling');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(
        () => element.classList.remove('is-scrolling'),
        2000,
      );
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      clearTimeout(hideTimer);
    };
  }, []);
  return ref;
}

export default function App() {
  const [page, setPage] = useState<PageKey>('site-audit');
  const Active = PAGES[page];
  const mainRef = useAutoHideScrollbar();
  const [notice, setNotice] = useState(() => config().notice ?? null);
  const {
    open: askingReview,
    scheduleAsk: askForReview,
    close: closeReviewPrompt,
  } = useReviewPrompt();

  // Covers the boot screen and every nav switch: setPage flows through the
  // NavContext, so this one effect sees them all.
  useEffect(() => {
    trackApp('PAGE_VIEW', { page_name: PAGE_NAMES[page] });
  }, [page]);

  // The success notice only exists on the page load right after the OAuth
  // redirect-back, so its presence at mount IS the connection moment.
  useEffect(() => {
    if (config().notice?.type === 'success') trackApp('ACCOUNT_CONNECTED');
  }, []);

  return (
    <NavContext.Provider value={setPage}>
      <ReviewAskContext.Provider value={askForReview}>
        <div className="flex h-screen text-zinc-900">
          <div className="flex flex-1 overflow-hidden rounded-xl bg-white">
            <aside className="flex w-56 shrink-0 flex-col gap-1 border-zinc-200 border-r bg-white p-3">
              <div className="px-3 py-4">
                <Text size="lg" weight="bold" className="text-orange-600">
                  Ubersuggest
                </Text>
              </div>
              {NAV.map(({ key, labelKey, icon: Icon }) => {
                const active = key === page;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPage(key)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      active
                        ? 'bg-orange-50 text-orange-700'
                        : 'text-zinc-600 hover:bg-zinc-100',
                    )}
                  >
                    <Icon size={18} />
                    <Text
                      size="sm"
                      weight={active ? 'semibold' : 'medium'}
                      className={active ? 'text-orange-700' : 'text-zinc-700'}
                      text={labelKey}
                    />
                  </button>
                );
              })}

              <div className="mt-auto px-1 pb-1">
                <LeaveReviewButton />
              </div>
            </aside>

            <main
              ref={mainRef}
              className="auto-hide-scrollbar flex-1 overflow-y-auto p-6"
            >
              {notice && (
                <div
                  className={cn(
                    'mb-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3',
                    notice.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50',
                  )}
                >
                  <Text
                    size="sm"
                    className={
                      notice.type === 'success'
                        ? 'text-emerald-800'
                        : 'text-red-800'
                    }
                  >
                    {notice.message}
                  </Text>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setNotice(null)}
                    className={cn(
                      'shrink-0 font-semibold text-sm',
                      notice.type === 'success'
                        ? 'text-emerald-700 hover:text-emerald-900'
                        : 'text-red-700 hover:text-red-900',
                    )}
                  >
                    ✕
                  </button>
                </div>
              )}
              <Active />
            </main>
          </div>

          <ReviewPromptDialog open={askingReview} onClose={closeReviewPrompt} />
        </div>
      </ReviewAskContext.Provider>
    </NavContext.Provider>
  );
}
