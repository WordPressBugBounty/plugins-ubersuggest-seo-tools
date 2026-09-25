import { useCallback, useRef, useState } from 'react';

import type { PreviewResponse } from '../services/fix-preview';
import type { ProjectCta } from '../types';

/**
 * Everything that decides whether a page may be sent for generation, and which
 * upsell the drawer shows when it may not.
 *
 * Generation is the plugin's only chargeable call, so the gate lives at that
 * one choke point and every caller — present or future — is covered by it.
 */
export function usePlanGate() {
  // No active subscription: Generate opens the free-trial paywall instead.
  const [freePlan, setFreePlan] = useState(false);
  const [freePaywall, setFreePaywall] = useState(false);
  // Set when AI is structurally unavailable (no project, none creatable):
  // the drawer opens a paywall-style modal instead of a plain error line.
  const [projectCta, setProjectCta] = useState<ProjectCta | null>(null);
  // The paywall CTA was clicked: the next kick-off retries against a FRESH
  // plan verdict (refresh_plan=1 drops the server cache) instead of the local
  // flag, so a user who just subscribed isn't held by either.
  const upgradeAttempted = useRef(false);

  const openFreePaywall = useCallback(() => setFreePaywall(true), []);
  const dismissFreePaywall = useCallback(() => setFreePaywall(false), []);
  const dismissProjectCta = useCallback(() => setProjectCta(null), []);
  const markUpgradeAttempted = useCallback(() => {
    upgradeAttempted.current = true;
  }, []);

  /**
   * Opens the gate for a chargeable call.
   *
   * @returns the query suffix to append, or null when the paywall took over
   * and the caller must not spend a credit.
   */
  const openChargeableCall = useCallback((): string | null => {
    if (freePlan && !upgradeAttempted.current) {
      setFreePaywall(true);
      return null;
    }
    const refreshPlan = upgradeAttempted.current ? '&refresh_plan=1' : '';
    upgradeAttempted.current = false;
    // A retry can succeed (a project slot may have been freed since), so the
    // notice resets with each attempt.
    setProjectCta(null);
    return refreshPlan;
  }, [freePlan]);

  /**
   * The server refused the kick-off: the account is (still) free. Opens the
   * paywall and reports true so the caller abandons the call.
   */
  const blockedByFreePlan = useCallback(
    (data: Pick<PreviewResponse, 'freePlan'>): boolean => {
      if (!data.freePlan) return false;
      setFreePlan(true);
      setFreePaywall(true);
      return true;
    },
    [],
  );

  /** Same, for a site with no usable UBS project behind it. */
  const blockedByMissingProject = useCallback(
    (data: Pick<PreviewResponse, 'projectRequired'>): boolean => {
      if (!data.projectRequired) return false;
      setProjectCta(data.projectRequired);
      return true;
    },
    [],
  );

  /**
   * Takes the plan verdict a response carried. A response that allowed a
   * chargeable call proves the account isn't free, which is what clears a
   * stale local flag after an upgrade; `undefined` says nothing either way.
   */
  const recordPlanVerdict = useCallback((verdict: boolean | undefined) => {
    if (verdict !== undefined) setFreePlan(verdict);
  }, []);

  return {
    freePlan,
    freePaywall,
    projectCta,
    openFreePaywall,
    dismissFreePaywall,
    dismissProjectCta,
    markUpgradeAttempted,
    openChargeableCall,
    blockedByFreePlan,
    blockedByMissingProject,
    recordPlanVerdict,
  };
}
