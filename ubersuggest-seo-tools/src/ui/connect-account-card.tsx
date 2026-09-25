import { Button, Heading, Text, translate } from '@ui';

import { SeoIconAnimated } from './seo-icon-animated';

/**
 * Why a screen can't load anything: the site has no usable Ubersuggest account.
 *
 * @property connectUrl The nonce'd admin-post URL that kicks off the OAuth flow
 * directly — one click to the provider, no intermediate settings page (the app
 * page itself is the redirect_uri, see UBS_SEO_OAuth_Client::redirect_uri).
 * @property expired True when the account WAS connected and its session dropped,
 * which asks to re-connect instead of connect.
 */
export type ConnectPrompt = {
  connectUrl: string;
  expired: boolean;
};

/**
 * What every load path adds to its response when the account is unusable, so a
 * response type can intersect this instead of re-declaring the three fields.
 */
export type NotConnectedFields = {
  notConnected?: boolean;
  expired?: boolean;
  connectUrl?: string;
};

/**
 * The prompt a response is asking for, or null when the account is fine.
 *
 * Every screen reads the same three optional fields and has to normalize them
 * the same way, so the defaults live here rather than at each call site.
 */
export function connectPromptFrom(
  data: NotConnectedFields,
): ConnectPrompt | null {
  return data.notConnected
    ? { connectUrl: data.connectUrl ?? '', expired: data.expired === true }
    : null;
}

/**
 * What every screen shows when there is no usable Ubersuggest account connected.
 *
 * The audit, the issues and the fixes all run on the account's plan, so there is
 * nothing to load and nothing to retry — the only next step is connecting.
 */
export function ConnectAccountCard({ connectUrl, expired }: ConnectPrompt) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="mx-auto flex w-full max-w-140 flex-col items-center gap-4 rounded-2xl bg-white px-6 py-10 text-center shadow-lg">
        <SeoIconAnimated width="64px" height="64px" />
        <Heading
          level={2}
          text={expired ? 'session_expired_title' : 'not_connected_title'}
        />
        <Text
          size="sm"
          color="muted"
          text={expired ? 'session_expired_body' : 'not_connected_body'}
        />
        <Button asChild variant="primary-solid">
          <a href={connectUrl} target="_top">
            {translate(expired ? 'reconnect_account' : 'connect_account')}
          </a>
        </Button>
      </div>
    </div>
  );
}
