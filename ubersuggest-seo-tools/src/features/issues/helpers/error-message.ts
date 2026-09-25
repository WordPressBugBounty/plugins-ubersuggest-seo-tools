import { translate } from '@ui';

import {
  connectPromptFrom,
  type NotConnectedFields,
} from '../../../ui/connect-account-card';

/**
 * A thrown request failure as the string the drawer can show: the `message`
 * when the throw carries one, the value itself otherwise.
 *
 * An `Error('')` falls back to the value too — the drawer renders the message
 * only when it is truthy, so an empty one stops the spinner and shows nothing.
 */
export function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  const text = String(message ?? error);
  return text === '' ? String(error) : text;
}

/**
 * The message to show when a response replaced its payload with a lost-account
 * notice, or null when the account is fine.
 *
 * Reads the flags through the shared helper, but answers with a message rather
 * than a prompt: the drawer has no Connect slot, so `connectUrl` has nowhere
 * to go.
 */
export function lostAccountMessage(data: NotConnectedFields): string | null {
  const prompt = connectPromptFrom(data);
  if (!prompt) return null;
  return translate(
    prompt.expired ? 'session_expired_body' : 'not_connected_body',
  );
}
