import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet } from '../../../api';
import { useSiteSpeed } from './use-site-speed';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockApiGet.mockReset();
});

describe('useSiteSpeed, no usable account', () => {
  it('surfaces a connect prompt and stops, instead of polling out silently', async () => {
    mockApiGet.mockResolvedValue({
      notConnected: true,
      expired: false,
      connectUrl: 'https://example.test/connect',
    });

    const { result } = renderHook(() => useSiteSpeed());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectPrompt).toEqual({
      connectUrl: 'https://example.test/connect',
      expired: false,
    });
    // The whole point of the branch: no second request is scheduled, because
    // another poll cannot produce an account.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    // And it is a connect prompt, never an error string — an error would render
    // whatever PHP happened to say, in English.
    expect(result.current.error).toBeNull();
  });

  it('asks to reconnect when the session dropped rather than never existed', async () => {
    mockApiGet.mockResolvedValue({
      notConnected: true,
      expired: true,
      connectUrl: 'https://example.test/connect',
    });

    const { result } = renderHook(() => useSiteSpeed());

    await waitFor(() => expect(result.current.connectPrompt).not.toBeNull());
    expect(result.current.connectPrompt?.expired).toBe(true);
  });

  it('still reports a real error as an error', async () => {
    mockApiGet.mockResolvedValue({ error: 'Site Speed request failed.' });

    const { result } = renderHook(() => useSiteSpeed());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Site Speed request failed.');
    expect(result.current.connectPrompt).toBeNull();
  });
});
