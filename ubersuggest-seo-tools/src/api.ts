/**
 * Bridge to the plugin's WP REST API. The PHP app page (class-app-page.php)
 * hands the iframe `{ restUrl, nonce }` in the URL fragment; we read it once and
 * use it for every call. Cookie auth + the wp_rest nonce authenticate us.
 */
import type { LinkSurface } from './tracking/surfaces';

/** Outcome of an OAuth connect that just landed back on the app page. */
export type OauthNotice = { type: 'success' | 'error'; message: string };

type Config = {
  restUrl: string;
  nonce: string;
  lang: string;
  appUrl: string;
  /**
   * The constant attribution params for links the UI builds itself. PHP owns
   * the vocabulary (UBS_SEO_App_Page::UTM_PARAMS) and passes it here, so the
   * two halves cannot drift.
   */
  utm: Record<string, string>;
  // Present only on the page load right after the OAuth redirect-back — the
  // PHP side stores it read-once, so a reload never re-announces it.
  notice?: OauthNotice;
};

/** Mirrors UBS_SEO_App_Page::UTM_PARAMS, for when the fragment is unreadable. */
const DEFAULT_UTM = {
  utm_source: 'wordpress-plugin',
  utm_medium: 'referral',
  utm_campaign: 'wordpress-plugin',
  utm_term: 'native-integration',
};

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  try {
    const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    const parsed = raw ? JSON.parse(raw) : {};
    cached = {
      restUrl: parsed.restUrl ?? '',
      nonce: parsed.nonce ?? '',
      // The plugin maps the WordPress site locale to a supported language and
      // passes it here so both the DS and our strings render in that language.
      lang: parsed.lang ?? 'en',
      appUrl: parsed.appUrl ?? 'https://ubersuggest.com',
      utm: parsed.utm ?? DEFAULT_UTM,
      notice:
        parsed.notice?.message &&
        (parsed.notice.type === 'success' || parsed.notice.type === 'error')
          ? { type: parsed.notice.type, message: String(parsed.notice.message) }
          : undefined,
    };
  } catch {
    cached = {
      restUrl: '',
      nonce: '',
      lang: 'en',
      appUrl: 'https://ubersuggest.com',
      utm: DEFAULT_UTM,
    };
  }
  return cached;
}

/**
 * A localized deep link into the Ubersuggest app, carrying the UTM params the
 * web app attributes the visit by — e.g. appLink('/pricing', 'free_trial_paywall').
 *
 * PHP builds the same shape for the links it hands the app; see
 * UBS_SEO_App_Page::app_url(). URL does the assembling in both halves, so an
 * existing query string, a fragment, and encoding all behave the same way here
 * as they do there.
 */
export function appLink(path: string, surface: LinkSurface): string {
  const { appUrl, lang, utm } = config();
  const url = new URL(`${appUrl}/${lang}${path}`);
  for (const [param, value] of Object.entries(utm)) {
    url.searchParams.set(param, value);
  }
  url.searchParams.set('utm_content', surface);
  return url.toString();
}

/** GET a plugin REST route (path relative to the namespace, e.g. "audit"). */
export async function apiGet<T>(path: string): Promise<T> {
  const { restUrl, nonce } = config();
  const response = await fetch(restUrl + path.replace(/^\//, ''), {
    headers: { 'X-WP-Nonce': nonce },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Request failed (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

/** POST JSON to a plugin REST route. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const { restUrl, nonce } = config();
  const response = await fetch(restUrl + path.replace(/^\//, ''), {
    method: 'POST',
    headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Request failed (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

/**
 * Full reload of the iframe document. The connect gates live on each page
 * (they key off `notConnected` in their own fetches), so after an action that
 * changes the connection itself — disconnect today — a reload is what puts
 * every screen back in the right state at once. Wrapped so tests can mock it
 * along with the rest of this module.
 */
export function reloadApp(): void {
  window.location.reload();
}
