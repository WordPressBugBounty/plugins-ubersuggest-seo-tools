import { describe, expect, it } from 'vitest';

import { appLink } from './api';

/**
 * These run against the config fallback: with no iframe fragment in jsdom,
 * config() yields the default app URL and 'en', which is all appLink needs.
 */
describe('appLink', () => {
  it('carries the UTM params the web app attributes the visit by', () => {
    const url = new URL(appLink('/pricing', 'free_trial_paywall'));

    expect(url.origin + url.pathname).toBe(
      'https://app.neilpatel.com/en/pricing',
    );
    // The four constants come from PHP through the config fragment; only
    // utm_content is decided here.
    expect(url.searchParams.get('utm_source')).toBe('wordpress-plugin');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_campaign')).toBe('wordpress-plugin');
    expect(url.searchParams.get('utm_term')).toBe('native-integration');
    expect(url.searchParams.get('utm_content')).toBe('free_trial_paywall');
  });

  // A query string written after the hash is read as part of the fragment, so
  // the params would reach nobody and the anchor would stop resolving.
  it('keeps a fragment last so the query survives it', () => {
    const link = appLink('/pricing#pricing-table', 'settings');

    expect(link.indexOf('?')).toBeLessThan(link.indexOf('#'));

    const url = new URL(link);
    expect(url.hash).toBe('#pricing-table');
    expect(url.searchParams.get('utm_content')).toBe('settings');
  });

  // The shape PHP's add_query_arg gives for free, and the one a hand-rolled
  // '?' concatenation gets wrong: the params must MERGE into an existing
  // query, not start a second one.
  it('merges into a path that already carries a query', () => {
    const url = new URL(appLink('/checkout?plan=pro', 'settings'));

    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('utm_source')).toBe('wordpress-plugin');
    expect(url.searchParams.get('utm_content')).toBe('settings');
  });

  it('handles a path carrying both a query and a fragment', () => {
    const link = appLink('/checkout?plan=pro#step-2', 'project_paywall');
    const url = new URL(link);

    expect(link.indexOf('?')).toBeLessThan(link.indexOf('#'));
    expect(url.hash).toBe('#step-2');
    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('utm_content')).toBe('project_paywall');
  });
});
