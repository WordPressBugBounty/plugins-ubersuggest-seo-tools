import neilHandsUp from './neil-hands-up.webp';

/** The same webp asset the dashboard renders (shared/assets in the app). */
export function NeilHandsUpIllustration({ className }: { className?: string }) {
  return <img src={neilHandsUp} alt="" className={className} />;
}
