import { useCallback, useEffect, useRef } from 'react';

type ActivePoll = { timerId?: number; settle: () => void };

/**
 * Runs one attempt. Resolve `true` to schedule another, `false` to settle.
 * Rejecting stops the chain and routes the error to `onError`.
 */
type PollAttempt = () => Promise<boolean>;

export type PollConfig = {
  intervalMs: number;
  /** Cap on how many times the attempt may run, including an immediate one. */
  maxAttempts: number;
};

export type StartPollConfig = {
  /** Run the first attempt now instead of after `intervalMs`. */
  immediate?: boolean;
  /** The attempt was still pending on the last allowed run. */
  onExhausted?: () => void;
  onError?: (error: unknown) => void;
};

/**
 * A keyed set of poll chains: one long-running "ask again until it settles"
 * loop per key, each with its own attempt budget and its own timer.
 *
 * Keys are namespaced by the hook instance, so two flows polling the same page
 * ref never share a timer — the reason a caller had to prefix its keys.
 *
 * `start` resolves when the chain ends for ANY reason (settled, exhausted,
 * errored, stopped), which is what lets a caller wrap the whole flow in a
 * single in-flight marker instead of clearing it on every exit path.
 */
export function usePoll({ intervalMs, maxAttempts }: PollConfig) {
  const polls = useRef<Map<string, ActivePoll>>(new Map());

  const stop = useCallback((key: string) => {
    const poll = polls.current.get(key);
    if (!poll) return;
    if (poll.timerId !== undefined) window.clearTimeout(poll.timerId);
    polls.current.delete(key);
    poll.settle();
  }, []);

  const stopAll = useCallback(() => {
    const running = Array.from(polls.current.values());
    polls.current.clear();
    for (const poll of running) {
      if (poll.timerId !== undefined) window.clearTimeout(poll.timerId);
      poll.settle();
    }
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const start = useCallback(
    (
      key: string,
      attempt: PollAttempt,
      { immediate, onExhausted, onError }: StartPollConfig = {},
    ): Promise<void> => {
      // Restarting a key replaces its chain rather than racing it.
      stop(key);

      return new Promise<void>((resolve) => {
        const poll: ActivePoll = { settle: resolve };
        polls.current.set(key, poll);
        let attemptsLeft = maxAttempts;

        // A request already in flight when the chain is stopped (or restarted)
        // still resolves — this is what keeps it from scheduling on top of the
        // chain that replaced it.
        const isCurrent = () => polls.current.get(key) === poll;

        const finish = () => {
          polls.current.delete(key);
          resolve();
        };

        const run = () => {
          poll.timerId = undefined;
          attemptsLeft -= 1;
          attempt()
            .then((keepPolling) => {
              if (!isCurrent()) return;
              if (!keepPolling) return finish();
              if (attemptsLeft <= 0) {
                // Settle first: a throwing callback must not be able to leave
                // this chain's promise — and the caller's busy mark with it —
                // hanging forever.
                finish();
                onExhausted?.();
                return;
              }
              poll.timerId = window.setTimeout(run, intervalMs);
            })
            .catch((error: unknown) => {
              if (!isCurrent()) return;
              onError?.(error);
              finish();
            });
        };

        if (immediate) run();
        else poll.timerId = window.setTimeout(run, intervalMs);
      });
    },
    [intervalMs, maxAttempts, stop],
  );

  return { start, stop, stopAll };
}
