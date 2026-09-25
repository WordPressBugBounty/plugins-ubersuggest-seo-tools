import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PreviewRow, RecrawlVerdict } from '../../types';
import { PreviewCards } from './preview-cards';

const row = (over: Partial<PreviewRow> = {}): PreviewRow => ({
  ref: '7',
  label: 'Page 7',
  url: 'https://example.com/7/',
  before: 'Old title',
  after: 'New title',
  status: 'fixed',
  source: 'ai',
  ...over,
});

const noop = () => {};

/**
 * Renders the card list around a single already-fixed page.
 *
 * The defaults are the state the button actually needs to exist — one `fixed`
 * row, nothing in flight, no verdict yet — so each test overrides only the one
 * axis it is about.
 */
function renderCards({
  rows = [row()],
  recrawlingRefs = [] as string[],
  verdicts = {} as Record<string, RecrawlVerdict>,
  fixedAt = {} as Record<string, number>,
  onRecrawl = noop,
} = {}) {
  return render(
    <PreviewCards
      rows={rows}
      generatingRefs={[]}
      applyingRefs={[]}
      recrawlingRefs={recrawlingRefs}
      verdicts={verdicts}
      fixedAt={fixedAt}
      canAfford={true}
      canApply={true}
      cost={2}
      maxChars={60}
      emptyValueKey="no_value"
      onGenerate={noop}
      onRegenerate={noop}
      onEdit={noop}
      onApply={noop}
      onRecrawl={onRecrawl}
    />,
  );
}

const recrawlButton = () => screen.queryByTestId('page-recrawl');

describe('per-page recrawl button', () => {
  it('shows on an already-fixed page and reports its ref when clicked', async () => {
    const user = userEvent.setup();
    const onRecrawl = vi.fn();
    renderCards({ onRecrawl });

    const button = recrawlButton();
    expect(button).toBeInTheDocument();
    await user.click(button as HTMLElement);

    expect(onRecrawl).toHaveBeenCalledWith('7');
  });

  it.each([
    ['idle', null],
    ['ready', 'New title'],
    ['pending', null],
    ['info', null],
  ] as const)(
    'stays hidden on a %s page — there is no fix to verify yet',
    (status, after) => {
      renderCards({ rows: [row({ status, after })] });

      expect(recrawlButton()).not.toBeInTheDocument();
    },
  );

  it('is disabled while its crawl is in flight', () => {
    renderCards({ recrawlingRefs: ['7'] });

    expect(recrawlButton()).toBeDisabled();
  });

  // The refresh icon hides while loading; without that, the DS spinner joins
  // it and the button shows two circles.
  it('swaps the refresh icon for one spinner while crawling', () => {
    renderCards({ recrawlingRefs: ['7'] });
    const button = recrawlButton() as HTMLElement;

    expect(within(button).getByTestId('loading-spinner')).toBeInTheDocument();
    expect(button.querySelectorAll('svg')).toHaveLength(1);
  });

  it('shows the refresh icon, and no spinner, when idle', () => {
    renderCards();
    const button = recrawlButton() as HTMLElement;

    expect(
      within(button).queryByTestId('loading-spinner'),
    ).not.toBeInTheDocument();
    expect(button.querySelectorAll('svg')).toHaveLength(1);
  });

  it.each([
    ['fixed', 'Crawl confirms this is fixed'],
    ['still_flagged', 'The crawl still flags this page'],
    ['too_soon', 'Crawled moments ago — check again shortly'],
    ['unknown', "Couldn't verify — try again"],
  ] as const)('renders the %s verdict', (verdict, expected) => {
    renderCards({ verdicts: { 7: verdict } });

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  // The crawler serves the OLD report for a page crawled under a minute ago,
  // so the button counts a 60s cooldown down from the apply instead of letting
  // a click bounce as 'too_soon'.
  it('counts a cooldown down after the apply, then enables', () => {
    vi.useFakeTimers();
    try {
      renderCards({ fixedAt: { 7: Date.now() } });
      const button = recrawlButton() as HTMLElement;

      expect(button).toBeDisabled();
      expect(button.textContent).toContain('(60)');

      act(() => vi.advanceTimersByTime(30_000));
      expect(button.textContent).toContain('(30)');
      expect(button).toBeDisabled();

      act(() => vi.advanceTimersByTime(31_000));
      expect(button).toBeEnabled();
      expect(button.textContent).not.toContain('(');
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the cooldown when the apply time is unknown', () => {
    renderCards();

    expect(recrawlButton()).toBeEnabled();
  });

  it('hides a previous verdict while a new crawl runs', () => {
    renderCards({ verdicts: { 7: 'still_flagged' }, recrawlingRefs: ['7'] });

    expect(
      screen.queryByText('The crawl still flags this page'),
    ).not.toBeInTheDocument();
  });

  // A page crawl writes its own report, so the Issues list keeps showing the old
  // count — the note is what stops that from reading as "the fix didn't work".
  const COUNTS_NOTE = /Issue counts update on the next full crawl/;

  it('warns that the issue counts lag when the fix is confirmed', () => {
    renderCards({ verdicts: { 7: 'fixed' } });

    expect(screen.getByText(COUNTS_NOTE)).toBeInTheDocument();
  });

  it.each(['still_flagged', 'too_soon', 'unknown'] as const)(
    'omits the counts note on a %s verdict — nothing was confirmed',
    (verdict) => {
      renderCards({ verdicts: { 7: verdict } });

      expect(screen.queryByText(COUNTS_NOTE)).not.toBeInTheDocument();
    },
  );
});
