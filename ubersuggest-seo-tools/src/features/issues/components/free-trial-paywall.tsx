import { ModalDialog, Text, type TranslationKeys, translate } from '@ui';

import { appLink } from '../../../api';
import { NeilHandsUpIllustration } from '../../../assets/neil-hands-up-illustration';
import { CheckIcon } from '../../../icons';
import { trackConversion } from '../../../tracking/conversion';

const BENEFITS: TranslationKeys[] = [
  'free_trial_benefit_credits',
  'free_trial_benefit_one_click',
  'free_trial_benefit_domains',
  'free_trial_benefit_pages',
  'free_trial_benefit_cwv',
  'free_trial_benefit_keywords',
  'free_trial_benefit_locations',
  'free_trial_benefit_more',
];

/**
 * Conversion paywall for accounts with no active subscription: AI fixes are a
 * paid-plan feature, so Generate opens this instead of spending a backend call.
 */
export function FreeTrialPaywall({
  open,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  /** The CTA was clicked: the next Generate retries against a fresh verdict. */
  onUpgrade?: () => void;
}) {
  return (
    <ModalDialog
      isOpen={open}
      onClose={onClose}
      variant="conversion"
      maxSize="max-w-xl"
      // Literal, not built from DRAWER_Z_INDEX: Tailwind only generates
      // arbitrary classes it can see as source text.
      zIndex="z-[100001]"
      content={
        <div className="flex flex-col items-center gap-4 text-center">
          <NeilHandsUpIllustration className="mx-auto h-36 w-auto object-contain" />
          <Text
            as="p"
            size="2xl"
            weight="bold"
            className="text-zinc-950 leading-tight"
            text="free_trial_title"
          />
          <div className="flex flex-col gap-1">
            <Text as="p" color="muted" text="free_trial_intro" />
            <Text as="p" color="muted" text="free_trial_intro_upgrade" />
          </div>
          <ul className="flex w-full flex-col gap-3 rounded-xl bg-zinc-50 p-5 text-left">
            {BENEFITS.map((benefitKey) => (
              <li key={benefitKey} className="flex items-center gap-3">
                <CheckIcon size={18} className="shrink-0 text-orange-600" />
                <Text size="sm" className="text-zinc-800" text={benefitKey} />
              </li>
            ))}
          </ul>
        </div>
      }
      footer={{
        primary: {
          buttonText: translate('start_free_trial'),
          size: 'xl',
          onClick: () => {
            trackConversion('VIEW_PLANS_CLICK', {
              source: 'free_trial_paywall',
            });
            onUpgrade?.();
            window.open(
              appLink('/pricing', 'free_trial_paywall'),
              '_blank',
              'noopener',
            );
            onClose();
          },
        },
        cancel: {
          buttonText: translate('cancel'),
          onClick: onClose,
        },
      }}
    />
  );
}
