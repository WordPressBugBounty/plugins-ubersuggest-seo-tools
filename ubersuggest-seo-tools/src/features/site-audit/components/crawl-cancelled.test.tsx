import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CrawlCancelled } from './crawl-cancelled';

describe('CrawlCancelled', () => {
  /** Cancelling the first crawl leaves nothing to read, only something to do. */
  it('offers a new crawl when there is no report to show', async () => {
    const onRecrawl = vi.fn();
    render(<CrawlCancelled onRecrawl={onRecrawl} recrawling={false} />);

    expect(screen.getByText('Crawl cancelled')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Recrawl website' }),
    );

    expect(onRecrawl).toHaveBeenCalledTimes(1);
  });

  it('locks the button once a crawl is starting', () => {
    render(<CrawlCancelled onRecrawl={() => {}} recrawling={true} />);

    expect(screen.getByRole('button', { name: 'Recrawling…' })).toBeDisabled();
  });
});
