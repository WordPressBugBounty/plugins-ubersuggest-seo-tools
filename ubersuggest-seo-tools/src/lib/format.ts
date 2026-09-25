// Locale number formatting shared across pages (e.g. 12480 → "12,480").
export const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US').format(value);

/**
 * A site-timezone wall clock ("2026-09-04 14:20:33") as words in the app's
 * locale.
 *
 * Pinned to UTC on both ends because the string carries no offset: PHP already
 * converted the instant to the SITE's timezone. Reading it as the viewer's
 * local time drops an hour whenever the wall clock lands in the viewer's own
 * DST spring-forward gap. Never do date arithmetic on the result.
 */
export function formatSiteDateTime(wallClock: string, locale: string): string {
  const parsed = new Date(`${wallClock.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return wallClock;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}
