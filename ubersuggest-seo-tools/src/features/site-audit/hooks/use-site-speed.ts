import { useCallback, useEffect, useRef, useState } from 'react';

import { apiGet } from '../../../api';
import {
  type ConnectPrompt,
  connectPromptFrom,
  type NotConnectedFields,
} from '../../../ui/connect-account-card';
import type { PageSpeedReport } from '../page-speed/types';

// The backend audit (Google PageSpeed) is async; poll the same endpoint until
// `done` is true. ~2 min cap (40 × 3s) — a cold PageSpeed run can take a while,
// and repeat loads hit the backend's 7-day cache instantly. Mirrors
// ubersuggest-next's usePageSpeed done-flag poll.
const MAX_POLLS = 40;
const POLL_INTERVAL_MS = 3000;

type PageSpeedResponse = NotConnectedFields & {
  done?: boolean;
  report?: PageSpeedReport;
  error?: string;
};

export function useSiteSpeed() {
  const [report, setReport] = useState<PageSpeedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectPrompt, setConnectPrompt] = useState<ConnectPrompt | null>(
    null,
  );
  const timer = useRef<number | null>(null);
  const polls = useRef(0);

  const poll = useCallback(() => {
    apiGet<PageSpeedResponse>('pagespeed')
      .then((data) => {
        // Checked before `error`, and before the poll rescheduling below: a
        // missing account is not something another poll can fix, and leaving it
        // to the `done` branch would spin for two minutes and then stop with
        // nothing on screen. Mirrors use-site-audit.
        const prompt = connectPromptFrom(data);
        if (prompt) {
          setConnectPrompt(prompt);
          setLoading(false);
          return;
        }
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }
        if (data.report) {
          setReport(data.report);
        }
        if (data.done || polls.current >= MAX_POLLS) {
          setLoading(false);
          return;
        }
        polls.current += 1;
        timer.current = window.setTimeout(poll, POLL_INTERVAL_MS);
      })
      .catch((err) => {
        setError(String(err.message ?? err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    poll();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poll]);

  return { report, loading, error, connectPrompt };
}
