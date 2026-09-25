import { apiPost } from '../api';

type PropertyValue = string | number | boolean;

/**
 * The property contract of every event in a module: SNAKE_CASE key → the
 * exact payload shape, or undefined for an event that carries none.
 */
type EventContracts = Record<string, Record<string, PropertyValue> | undefined>;

/**
 * Builds a feature's tracker, mirroring the web app's createMixpanelModule:
 * SNAKE_CASE keys in code, Title Case event names on the wire, and each
 * event's properties held to its declared contract. The contract lives in the
 * type system only — every call site is TypeScript in this repo, so the
 * compiler covers what the web app also re-checks at runtime for its
 * dynamically built payloads.
 *
 * Delivery is the fire-and-forget relay: POST to the plugin's /track route,
 * where PHP resolves the identity, stamps `channel: "wordpress-plugin"` and
 * signs the payload for the backend. Failures are swallowed on purpose —
 * losing an event must never break the UI — but logged as the only trace of
 * a dead nonce silently dropping every event.
 */
export function createTrackingModule<Contracts extends EventContracts>(
  eventNames: { readonly [K in keyof Contracts]: string },
) {
  return function trackEvent<K extends keyof Contracts>(
    event: K,
    ...properties: Contracts[K] extends undefined ? [] : [Contracts[K]]
  ): void {
    apiPost<{ ok?: boolean }>('track', {
      event: eventNames[event],
      properties: properties[0],
    })
      // A refused event answers `ok: false` on a 200, so apiPost resolves and
      // the catch below never sees it. Without this line a site dropping every
      // event — a connected account whose email stops resolving — does it in
      // total silence. PHP logs the reason behind WP_DEBUG; this is the half
      // that shows up in the admin's console on a live site.
      .then((result) => {
        if (result && result.ok === false) {
          console.error('[ubs-seo] tracking event refused', eventNames[event]);
        }
      })
      .catch((error) => console.error('[ubs-seo] tracking failed', error));
  };
}
