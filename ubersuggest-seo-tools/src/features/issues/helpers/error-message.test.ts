import { describe, expect, it } from 'vitest';

import { errorMessage, lostAccountMessage } from './error-message';

describe('errorMessage', () => {
  it('reads the message off a thrown Error', () => {
    expect(errorMessage(new Error('network down'))).toBe('network down');
  });

  it('falls back to the value itself when the throw carries no message', () => {
    expect(errorMessage('plain string')).toBe('plain string');
  });

  it('survives a null throw rather than reading through it', () => {
    expect(errorMessage(null)).toBe('null');
  });

  it('falls back to the value when the message is empty', () => {
    expect(errorMessage(new Error(''))).toBe('Error');
  });
});

describe('lostAccountMessage', () => {
  it('stays quiet while the account is fine', () => {
    expect(lostAccountMessage({})).toBeNull();
    expect(lostAccountMessage({ expired: true })).toBeNull();
  });

  it('tells a disconnected account apart from an expired session', () => {
    const disconnected = lostAccountMessage({ notConnected: true });
    const expired = lostAccountMessage({ notConnected: true, expired: true });

    expect(disconnected).toBeTruthy();
    expect(expired).toBeTruthy();
    // Different remedies: one reconnects, the other signs in again.
    expect(expired).not.toBe(disconnected);
  });
});
