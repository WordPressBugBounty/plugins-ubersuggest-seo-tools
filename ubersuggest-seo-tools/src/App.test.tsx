import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { apiGet, apiPost, config } from './api';

vi.mock('./api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  appLink: (path: string, surface: string) =>
    `https://ubersuggest.com/en${path}?utm_content=${surface}`,
  config: vi.fn(),
}));

const DEFAULT_CONFIG = {
  restUrl: '',
  nonce: '',
  lang: 'en',
  appUrl: 'https://ubersuggest.com',
  utm: {
    utm_source: 'wordpress-plugin',
    utm_medium: 'referral',
    utm_campaign: 'wordpress-plugin',
    utm_term: 'native-integration',
  },
};

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);
const mockConfig = vi.mocked(config);

const ISSUE = {
  id: 'title_long',
  label: 'Title tag too long',
  count: 1,
  level: 'warnings',
  seoImpact: 'medium',
  difficulty: 'easy',
  fix: { state: 'fixable', message: '1 title is too long.', previewable: true },
};

const READY_ROW = {
  ref: '25',
  label: 'Page 25',
  url: 'https://example.com/25/',
  before: 'Old long title',
  after: 'New title',
  status: 'ready',
  source: 'ai',
};

const HISTORY_RECORD = {
  id: 3,
  action: 'apply',
  issueId: 'title_long',
  ref: '25',
  field: 'title',
  pageTitle: 'Pricing',
  pageUrl: 'https://example.com/pricing/',
  pageExists: true,
  before: 'Old long title',
  after: 'New title',
  restores: true,
  stale: false,
  source: 'ai',
  integration: 'native',
  user: 'admin',
  appliedAt: '2026-09-04T14:20:33+00:00',
  appliedAtSite: '2026-09-04 11:20:33',
  revertRefusal: null,
};

beforeEach(() => {
  // shouldAdvanceTime keeps userEvent and waitFor running on their own clock,
  // while letting the test jump the prompt's deliberate delay instead of
  // spending four real seconds of the suite on it.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockConfig.mockReturnValue(DEFAULT_CONFIG);
  // Default resolution so the fire-and-forget tracking posts App makes on
  // mount have a promise to swallow; tests that care override it.
  mockApiPost.mockResolvedValue({ ok: true });
  mockApiGet.mockImplementation((path: string) => {
    if (path.startsWith('issues')) return Promise.resolve({ issues: [ISSUE] });
    if (path.startsWith('fix/preview')) {
      return Promise.resolve({
        rows: [READY_ROW],
        credits: { used: 0, limit: 1000, remaining: 757, cost: 2 },
      });
    }
    if (path.startsWith('history')) {
      return Promise.resolve({
        records: [HISTORY_RECORD],
        total: 1,
        perPage: 25,
        issueTypes: ['title_long'],
      });
    }
    // Site Audit is the page App boots on: the test never asserts on it, it
    // just has to render on the way to SEO Issues.
    if (path.startsWith('audit')) {
      return Promise.resolve({
        domain: 'example.com',
        lastCrawl: '2026-08-20',
        overview: { seoScore: 80 },
        pagesCrawled: 10,
        blocked: 0,
        pageStatus: { successful: 10, redirected: 0, broken: 0, blocked: 0 },
        totalIssues: 1,
        topIssues: [],
      });
    }
    return Promise.resolve({});
  });
});

afterEach(() => vi.useRealTimers());

/**
 * App's composition, which no other test covers: the review prompt is provided
 * here and consumed four levels down in the fix drawer, through a context whose
 * default is a silent no-op. Dropping the provider — or wiring `open` to the
 * wrong value — would compile, pass every focused test, and just never ask
 * anyone for a review again.
 */
describe('App wiring', () => {
  it('opens the review prompt after a fix is applied', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockApiPost.mockResolvedValue({
      ok: true,
      appliedRefs: ['25'],
      shouldAskForReview: true,
    });

    render(<App />);

    await user.click(screen.getByText('SEO Issues'));
    await waitFor(() => expect(screen.getByText('Fix it')).toBeDefined());

    await user.click(screen.getByText('Fix it'));
    await waitFor(() => expect(screen.getByText('New title')).toBeDefined());

    await user.click(screen.getByText('Apply'));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('fix/apply', {
        issue: 'title_long',
        values: { '25': 'New title' },
        sources: { '25': 'ai' },
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText(/first fix is live/i)).toBeInTheDocument();
    expect(mockApiPost).toHaveBeenCalledWith('review-prompt', {});
  });

  it('keeps the review form one click away in the sidebar', () => {
    render(<App />);

    expect(
      screen.getByRole('link', { name: 'Leave a Review' }),
    ).toHaveAttribute(
      'href',
      'https://wordpress.org/support/plugin/ubersuggest-seo-tools/reviews/#new-post',
    );
  });

  it('tracks a page view on boot and on every nav switch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<App />);

    expect(mockApiPost).toHaveBeenCalledWith('track', {
      event: 'Page View',
      properties: { page_name: 'site_audit' },
    });

    await user.click(screen.getByText('SEO Issues'));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('track', {
        event: 'Page View',
        properties: { page_name: 'issues' },
      }),
    );
  });

  it('reaches the fix history from its own nav tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<App />);
    await user.click(screen.getByText('Fix History'));

    await waitFor(() => expect(screen.getByText('Pricing')).not.toBeNull());
  });

  it('tracks the fix funnel: the Fix it and Regenerate clicks', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<App />);

    await user.click(screen.getByText('SEO Issues'));
    await waitFor(() => expect(screen.getByText('Fix it')).toBeDefined());

    await user.click(screen.getByText('Fix it'));
    expect(mockApiPost).toHaveBeenCalledWith('track', {
      event: 'Fix It Click',
      properties: { issue: 'title_long' },
    });

    await waitFor(() => expect(screen.getByText('New title')).toBeDefined());
    await user.click(screen.getByText('Regenerate'));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('track', {
        event: 'Generate Suggestion Click',
        properties: {
          issue: 'title_long',
          action: 'regenerate',
          blocked: false,
        },
      }),
    );
  });

  it('tracks the connection announced by the OAuth success notice', () => {
    mockConfig.mockReturnValue({
      ...DEFAULT_CONFIG,
      notice: { type: 'success', message: 'Account connected.' },
    });

    render(<App />);

    expect(mockApiPost).toHaveBeenCalledWith('track', {
      event: 'Account Connected',
    });
  });

  it('does not claim a connection on an OAuth error notice', () => {
    mockConfig.mockReturnValue({
      ...DEFAULT_CONFIG,
      notice: { type: 'error', message: 'Connection failed.' },
    });

    render(<App />);

    expect(mockApiPost).not.toHaveBeenCalledWith(
      'track',
      expect.objectContaining({ event: 'Account Connected' }),
    );
  });
});
