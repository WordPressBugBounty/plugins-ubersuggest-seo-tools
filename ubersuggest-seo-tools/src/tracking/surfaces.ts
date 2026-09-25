/**
 * Every place the plugin links out to Ubersuggest from, in one list.
 *
 * This is the `utm_content` a report groups by, so the names are a deliberate
 * vocabulary rather than whatever a call site passes. PHP builds four of these
 * links and React one — see UBS_SEO_App_Page::app_url() — so the PHP literals
 * are pinned by AppLinkTest rather than by this type.
 */
export type LinkSurface =
  | 'free_trial_paywall'
  | 'project_paywall'
  | 'project_paywall_manage'
  | 'settings'
  | 'settings_notifications';

/**
 * The surfaces that also emit a tracked event, so the event's `source` and the
 * link's `utm_content` are the same value and a funnel joins across the
 * boundary. Extract, not a second literal union: a name that stops being a
 * real surface stops compiling here.
 */
export type TrackedSurface = Extract<
  LinkSurface,
  'free_trial_paywall' | 'project_paywall' | 'settings'
>;
