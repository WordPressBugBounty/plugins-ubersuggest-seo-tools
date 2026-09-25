import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REVIEW_URL } from '../review-url';
import { ReviewPromptDialog } from './review-prompt-dialog';

afterEach(() => vi.restoreAllMocks());

describe('ReviewPromptDialog', () => {
  it('stays out of the way until it is opened', () => {
    render(<ReviewPromptDialog open={false} onClose={vi.fn()} />);

    expect(screen.queryByText(/first fix is live/i)).not.toBeInTheDocument();
  });

  // One way forward and the X to leave: a second dismissal button would give the
  // ask more weight on screen than it deserves.
  it('offers the review CTA and nothing but the X to dismiss', () => {
    render(<ReviewPromptDialog open onClose={vi.fn()} />);

    expect(screen.getByText(/first fix is live/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  // The CTA can't be a link: the modal has to close as well, or it stays open
  // behind the new tab waiting to be dismissed a second time.
  it('opens the review form in a new tab and closes', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const onClose = vi.fn();
    render(<ReviewPromptDialog open onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Leave a Review' }),
    );

    expect(open).toHaveBeenCalledWith(REVIEW_URL, '_blank', 'noopener');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the X', async () => {
    const onClose = vi.fn();
    render(<ReviewPromptDialog open onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
