import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CardLabel } from './card';

describe('CardLabel hints', () => {
  it('shows the hint text on hover', async () => {
    const user = userEvent.setup();
    render(
      <CardLabel hint="overview_backlinks_hint" text="overview_backlinks" />,
    );

    // Nothing until the user asks for it — the point of a tooltip.
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.hover(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('tooltip').textContent).toContain(
        'Links from other websites pointing to your site',
      ),
    );
  });

  it('renders no (i) at all when there is no hint', () => {
    render(<CardLabel text="overview_backlinks" />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
