import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost, reloadApp } from '../../../api';
import Settings from './settings';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  reloadApp: vi.fn(),
}));

// This page tracks View Plans, and these tests are about disconnecting: an
// unmocked tracker would close over the real apiPost, so the first test to
// click that button would reach the network instead of failing readably.
vi.mock('../../../tracking/conversion', () => ({ trackConversion: vi.fn() }));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);
const mockReloadApp = vi.mocked(reloadApp);

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockImplementation((path: string) => {
    if (path === 'connection') {
      return Promise.resolve({ connected: true });
    }
    return Promise.resolve({
      domain: 'example.com',
      crawlFrequency: 'weekly',
      planUrl: 'https://ubs.example/pricing',
      notificationsUrl: 'https://ubs.example/notifications',
    });
  });
});

describe('disconnect confirmation', () => {
  it('asks before disconnecting — the click alone must never revoke', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByText('Disconnect'));

    expect(
      screen.getByText('Disconnect your Ubersuggest account?'),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Site Audit and AI fix suggestions will stop working on this site until you connect again.',
      ),
    ).toBeDefined();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('cancel closes the dialog without disconnecting', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByText('Disconnect'));
    await user.click(screen.getByText('Cancel'));

    await waitFor(() =>
      expect(
        screen.queryByText('Disconnect your Ubersuggest account?'),
      ).toBeNull(),
    );
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockReloadApp).not.toHaveBeenCalled();
  });

  it('confirming calls the endpoint and reloads the app', async () => {
    mockApiPost.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByText('Disconnect'));
    // The dialog's primary action repeats the verb, so target it inside the
    // dialog: it's the last "Disconnect" in the document.
    const buttons = screen.getAllByText('Disconnect');
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('connection/disconnect', {}),
    );
    await waitFor(() => expect(mockReloadApp).toHaveBeenCalled());
  });

  it('a failed disconnect surfaces the error and never reloads', async () => {
    mockApiPost.mockRejectedValue(new Error('HTTP 500'));
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByText('Disconnect'));
    const buttons = screen.getAllByText('Disconnect');
    await user.click(buttons[buttons.length - 1]);

    expect(
      await screen.findByText('Could not disconnect — try again.'),
    ).toBeDefined();
    expect(mockReloadApp).not.toHaveBeenCalled();
  });

  it('shows no Disconnect button when the account is not connected', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === 'connection') {
        return Promise.resolve({ connected: false });
      }
      return Promise.resolve({
        domain: 'example.com',
        crawlFrequency: 'weekly',
        planUrl: '',
        notificationsUrl: '',
      });
    });
    render(<Settings />);

    expect(await screen.findByText('Not connected')).toBeDefined();
    expect(screen.queryByText('Disconnect')).toBeNull();
  });
});
