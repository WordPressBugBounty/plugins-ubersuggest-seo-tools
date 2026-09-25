import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiPost } from '../api';
import { createTrackingModule } from './core';

vi.mock('../api', () => ({ apiPost: vi.fn() }));

const mockApiPost = vi.mocked(apiPost);

type TestEvents = {
  THING_CLICK: { thing: string; mode: 'quick' | 'slow' };
  BARE_EVENT: undefined;
};

const trackTest = createTrackingModule<TestEvents>({
  THING_CLICK: 'Thing Click',
  BARE_EVENT: 'Bare Event',
});

describe('createTrackingModule', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({ ok: true });
  });

  it('posts the Title Case name and the properties to the track route', () => {
    trackTest('THING_CLICK', { thing: 'title_long', mode: 'quick' });

    expect(mockApiPost).toHaveBeenCalledWith('track', {
      event: 'Thing Click',
      properties: { thing: 'title_long', mode: 'quick' },
    });
  });

  it('posts a propertyless event without a properties payload', () => {
    trackTest('BARE_EVENT');

    expect(mockApiPost).toHaveBeenCalledWith('track', {
      event: 'Bare Event',
      properties: undefined,
    });
  });

  it('holds call sites to the event contracts at compile time', () => {
    const rejected = [
      // @ts-expect-error — THING_CLICK declares properties, so they are required
      () => trackTest('THING_CLICK'),
      // @ts-expect-error — property name not in the contract
      () => trackTest('THING_CLICK', { thingg: 'x', mode: 'quick' }),
      // @ts-expect-error — not one of the declared mode values
      () => trackTest('THING_CLICK', { thing: 'x', mode: 'fast' }),
      // @ts-expect-error — BARE_EVENT declares no properties
      () => trackTest('BARE_EVENT', { thing: 'x' }),
      // @ts-expect-error — unknown event key
      () => trackTest('UNKNOWN_EVENT'),
    ];

    expect(rejected).toHaveLength(5);
  });

  // A refused event rides a 200, so apiPost resolves and .catch never fires —
  // the log is the only sign that a site is dropping everything it sends.
  it('reports an event the server refused', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockApiPost.mockResolvedValue({ ok: false });

    trackTest('BARE_EVENT');

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[ubs-seo] tracking event refused',
        'Bare Event',
      ),
    );

    consoleError.mockRestore();
  });

  it('stays quiet when the server accepts the event', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    trackTest('BARE_EVENT');
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalled());

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('swallows a failed post so the UI never notices', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockApiPost.mockRejectedValue(new Error('nonce expired'));

    expect(() => trackTest('BARE_EVENT')).not.toThrow();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

    consoleError.mockRestore();
  });
});
