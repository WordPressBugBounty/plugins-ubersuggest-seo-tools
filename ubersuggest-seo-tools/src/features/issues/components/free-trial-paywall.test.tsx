import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiPost, appLink } from '../../../api';
import { FreeTrialPaywall } from './free-trial-paywall';

vi.mock('../../../api', () => ({
  apiPost: vi.fn().mockResolvedValue({ ok: true }),
  appLink: vi.fn(
    (path: string, surface: string) =>
      `https://app.neilpatel.com/en${path}?utm_content=${surface}`,
  ),
}));

afterEach(() => vi.clearAllMocks());

describe('FreeTrialPaywall', () => {
  it('tracks the View Plans intent when the trial CTA is clicked', async () => {
    const user = userEvent.setup();
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const onClose = vi.fn();

    render(<FreeTrialPaywall open onClose={onClose} />);

    await user.click(screen.getByText('Start free trial'));

    expect(vi.mocked(apiPost)).toHaveBeenCalledWith('track', {
      event: 'View Plans Click',
      properties: { source: 'free_trial_paywall' },
    });
    expect(vi.mocked(appLink)).toHaveBeenCalledWith(
      '/pricing',
      'free_trial_paywall',
    );
    expect(windowOpen).toHaveBeenCalledWith(
      'https://app.neilpatel.com/en/pricing?utm_content=free_trial_paywall',
      '_blank',
      'noopener',
    );
    expect(onClose).toHaveBeenCalled();

    windowOpen.mockRestore();
  });
});
