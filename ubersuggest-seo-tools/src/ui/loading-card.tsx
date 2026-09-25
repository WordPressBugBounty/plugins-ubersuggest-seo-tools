import { Text, type TranslationKeys } from '@ui';
import { type ReactNode, useEffect, useState } from 'react';

import { dynamicKey } from '../i18n/translate-dynamic';
import { SeoIconAnimated } from './seo-icon-animated';

// The dashboard rotates through 30 tips; we ship the first 10 (verbatim, all 9
// languages). Every full-page loading state shows one, so a wait always teaches
// something — matching the Ubersuggest dashboard's LoadingCard.
const TIP_COUNT = 10;
const ROTATION_INTERVAL_MS = 8000; // same cadence as the dashboard

/**
 * Full-page loading screen, mirroring the Ubersuggest dashboard's LoadingCard
 * (seo variant): white card, animated SEO icon, orange-gradient title, borealis
 * progress bar, and the rotating "SEO Tip of the Day". Used for every blocking
 * load (site audit, SEO issues, a running crawl); `subline` carries any
 * context-specific line (e.g. the live pages-crawled count).
 */
export function LoadingCard({
  title,
  subline,
}: {
  /** A catalog key, matching the design system's `text` contract. */
  title: TranslationKeys;
  subline?: ReactNode;
}) {
  // Start at a minute-seeded tip so back-to-back loads don't always open on tip
  // 1, then advance sequentially.
  const [tipIndex, setTipIndex] = useState(
    () => Math.floor(Date.now() / 60000) % TIP_COUNT,
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setTipIndex((index) => (index + 1) % TIP_COUNT),
      ROTATION_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="mx-auto flex w-full max-w-180 flex-col items-center gap-4 rounded-2xl bg-white py-4 text-center shadow-lg sm:py-8">
        <div className="flex w-full flex-col items-center justify-center gap-3">
          <SeoIconAnimated width="64px" height="64px" />
          <Text
            weight="bold"
            className="block bg-[linear-gradient(98deg,#FF5E29_12.48%,#FF9D00_31.41%)] bg-clip-text text-center text-lg text-zinc-600 [-webkit-text-fill-color:transparent]"
            text={title}
          />
        </div>

        <div className="w-[58%] self-center">
          <div className="relative h-1 overflow-hidden rounded-full border-transparent bg-gray-200 p-px">
            <div className="absolute inset-y-0 h-1 w-1/3 origin-center animate-borealis-bar rounded-full bg-linear-to-r from-orange-500 to-[#FF9D00]" />
          </div>
        </div>

        {subline}

        <div className="flex w-full flex-col items-center gap-3 rounded-3xl p-10">
          <Text
            size="4xl"
            weight="medium"
            className="text-center text-zinc-950"
            text="seo_tip_of_the_day"
          />
          {/* key remounts the tip so the fade-in replays on every rotation */}
          <div key={tipIndex} className="tip-fade">
            <Text
              size="xl"
              weight="normal"
              className="text-center text-black/50"
              text={dynamicKey(`seo_tip_${tipIndex + 1}`)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
