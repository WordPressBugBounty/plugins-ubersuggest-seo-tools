import { createTrackingModule } from './core';

/**
 * The fix funnel on the SEO Issues page. `issue` is the backend issue id
 * (e.g. `title_long`), so funnels can be cut per issue type.
 */
type IssueEvents = {
  FIX_IT_CLICK: { issue: string };
  GENERATE_SUGGESTION_CLICK: {
    issue: string;
    action: 'generate' | 'regenerate';
    /** True when the free-plan gate opened the paywall instead of generating. */
    blocked: boolean;
  };
};

export const trackIssues = createTrackingModule<IssueEvents>({
  FIX_IT_CLICK: 'Fix It Click',
  GENERATE_SUGGESTION_CLICK: 'Generate Suggestion Click',
});
