import { createTrackingModule } from './core';

/**
 * The canonical page_name values Mixpanel reports on. A closed union, not
 * string: nav keys are internal and renameable, reporting dimensions are not.
 */
export type TrackedPageName = 'site_audit' | 'issues' | 'history' | 'settings';

/** App-shell events: navigation and the OAuth connection moment. */
type AppEvents = {
  PAGE_VIEW: { page_name: TrackedPageName };
  ACCOUNT_CONNECTED: undefined;
};

export const trackApp = createTrackingModule<AppEvents>({
  PAGE_VIEW: 'Page View',
  ACCOUNT_CONNECTED: 'Account Connected',
});
