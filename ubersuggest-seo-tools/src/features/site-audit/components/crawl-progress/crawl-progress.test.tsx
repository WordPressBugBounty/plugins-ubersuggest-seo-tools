import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CrawlProgress } from './crawl-progress';

const PROGRESS_PROPS = {
  count: 12,
  takingLong: false,
  cancelling: false,
  cancelFailed: false,
  onCancel: () => {},
};

describe('CrawlProgress', () => {
  /**
   * This screen replaces the whole page while a crawl runs, so if the button
   * is not here the crawl cannot be called off at all — which is the bug.
   */
  it('offers a way out of a running crawl', async () => {
    const onCancel = vi.fn();
    render(<CrawlProgress {...PROGRESS_PROPS} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel crawl' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  /** A second click would post a stop for a crawl already being stopped. */
  it('locks the button while the stop is in flight', () => {
    render(<CrawlProgress {...PROGRESS_PROPS} cancelling={true} />);

    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  });

  /** Silence after a failed stop reads as a button that does nothing. */
  it('says so when the crawl could not be stopped', () => {
    render(<CrawlProgress {...PROGRESS_PROPS} cancelFailed={true} />);

    expect(
      screen.getByText("Couldn't stop the crawl — it is still running."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel crawl' })).toBeEnabled();
  });
});
