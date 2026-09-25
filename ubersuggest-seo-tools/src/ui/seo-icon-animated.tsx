import type { SVGProps } from 'react';

/**
 * CSS-only port of the Ubersuggest dashboard's SeoIconAnimated (which uses
 * motion/react): three orange bars rise in a stagger, then a trend line draws
 * over them, everything collapses and the 3.8s cycle repeats. Keyframes live in
 * styles.css (.seo-icon-*), matching the original timing arrays.
 */
export const SeoIconAnimated = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={74}
    height={64}
    viewBox="0 0 74 64"
    fill="none"
    aria-label="SEO Loading Animation"
    role="img"
    {...props}
  >
    <rect
      className="seo-icon-bar seo-icon-bar1"
      x={11}
      y={44}
      width={12}
      height={18}
      rx={1.5}
      fill="#FF5E29"
    />
    <rect
      className="seo-icon-bar seo-icon-bar2"
      x={31}
      y={34}
      width={12}
      height={28}
      rx={1.5}
      fill="#FF5E29"
    />
    <rect
      className="seo-icon-bar seo-icon-bar3"
      x={51}
      y={25}
      width={12}
      height={37}
      rx={1.5}
      fill="#FF5E29"
    />
    <path
      className="seo-icon-line"
      d="M4 30 Q 14 22, 22 28 T 38 22 T 52 16 T 70 6"
      pathLength={1}
      stroke="#FFC5B2"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);
