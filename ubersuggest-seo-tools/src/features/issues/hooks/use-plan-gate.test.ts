import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePlanGate } from './use-plan-gate';

describe('usePlanGate', () => {
  it('lets a paid account through with no extra query', () => {
    const { result } = renderHook(() => usePlanGate());

    let suffix: string | null = null;
    act(() => {
      suffix = result.current.openChargeableCall();
    });

    expect(suffix).toBe('');
    expect(result.current.freePaywall).toBe(false);
  });

  it('opens the paywall instead of spending a credit on a free plan', () => {
    const { result } = renderHook(() => usePlanGate());
    act(() => void result.current.blockedByFreePlan({ freePlan: true }));
    expect(result.current.freePlan).toBe(true);

    let suffix: string | null = '';
    act(() => {
      suffix = result.current.openChargeableCall();
    });

    expect(suffix).toBeNull();
    expect(result.current.freePaywall).toBe(true);
  });

  it('retries against a fresh server verdict after an upgrade attempt', () => {
    const { result } = renderHook(() => usePlanGate());
    act(() => void result.current.blockedByFreePlan({ freePlan: true }));

    act(() => result.current.markUpgradeAttempted());
    let suffix: string | null = null;
    act(() => {
      suffix = result.current.openChargeableCall();
    });

    // The local free-plan flag is bypassed, and the server is told to drop its
    // cached verdict rather than answer from it.
    expect(suffix).toBe('&refresh_plan=1');
  });

  it('spends the upgrade attempt once, then holds the account again', () => {
    const { result } = renderHook(() => usePlanGate());
    act(() => void result.current.blockedByFreePlan({ freePlan: true }));
    act(() => result.current.markUpgradeAttempted());
    act(() => void result.current.openChargeableCall());

    let second: string | null = '';
    act(() => {
      second = result.current.openChargeableCall();
    });

    expect(second).toBeNull();
  });

  it('drops a stale project notice on every attempt', () => {
    const { result } = renderHook(() => usePlanGate());
    act(
      () =>
        void result.current.blockedByMissingProject({
          projectRequired: {
            domain: 'example.com',
            manageProjectsUrl: 'https://app.example/projects',
            upgradeUrl: 'https://app.example/upgrade',
          },
        }),
    );
    expect(result.current.projectCta).not.toBeNull();

    // A retry can succeed — a project slot may have been freed since.
    act(() => void result.current.openChargeableCall());

    expect(result.current.projectCta).toBeNull();
  });

  it('reports a refusal only when the response carries one', () => {
    const { result } = renderHook(() => usePlanGate());

    expect(result.current.blockedByFreePlan({})).toBe(false);
    expect(result.current.blockedByMissingProject({})).toBe(false);
  });

  it('takes a plan verdict from a response but ignores a silent one', () => {
    const { result } = renderHook(() => usePlanGate());

    act(() => result.current.recordPlanVerdict(true));
    expect(result.current.freePlan).toBe(true);

    act(() => result.current.recordPlanVerdict(undefined));
    expect(result.current.freePlan).toBe(true);

    act(() => result.current.recordPlanVerdict(false));
    expect(result.current.freePlan).toBe(false);
  });
});
