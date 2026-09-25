import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { REVIEW_URL } from '../review-url';
import { LeaveReviewButton } from './leave-review-button';

describe('LeaveReviewButton', () => {
  // The plugin renders inside a wp-admin iframe: a same-tab navigation would
  // load wordpress.org INSIDE that frame and trap the user there.
  it('opens the WordPress.org review form in a new tab', () => {
    render(<LeaveReviewButton />);

    const link = screen.getByRole('link', { name: 'Leave a Review' });
    expect(link).toHaveAttribute('href', REVIEW_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
