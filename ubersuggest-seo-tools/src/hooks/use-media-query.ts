import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query currently matches, kept in sync as it changes.
 *
 * Mirrors ubersuggest-next's shared/hooks/use-media-query. The design system
 * ships use-mobile and use-large-screen, but those answer "how wide is the
 * viewport" — not the capability questions (`hover`, `pointer`) a wide tablet
 * would answer differently from a desktop.
 *
 * Starts false and resolves in the effect, so the first paint never depends on
 * matchMedia being available.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
