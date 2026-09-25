import { Button, ModalDialog, Text, translate } from '@ui';

import { NeilHandsUpIllustration } from '../../../assets/neil-hands-up-illustration';
import { REVIEW_URL } from '../review-url';

/**
 * The ask itself, opened a few seconds after the user's first applied fix.
 *
 * zIndex is a literal above the fix drawer's `z-[100000]` (see DRAWER_Z_INDEX):
 * the fix is applied from inside that drawer, so the modal has to stack over it.
 * Tailwind only generates arbitrary classes it can see as source text, which is
 * why this isn't computed from the constant.
 */
export function ReviewPromptDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const openReview = () => {
    window.open(REVIEW_URL, '_blank', 'noopener');
    onClose();
  };

  return (
    <ModalDialog
      isOpen={open}
      onClose={onClose}
      variant="center"
      maxSize="max-w-md"
      zIndex="z-[100001]"
      content={
        <div className="flex flex-col items-center gap-3 text-center">
          <NeilHandsUpIllustration className="mx-auto h-28 w-auto object-contain" />
          <Text
            as="p"
            size="xl"
            weight="bold"
            className="text-zinc-950 leading-tight"
            text="review_prompt_title"
          />
          <Text as="p" color="muted" text="review_prompt_body" />
        </div>
      }
      footer={
        <div className="flex justify-center">
          <Button variant="primary-cta" size="lg" onClick={openReview}>
            {translate('leave_review')}
          </Button>
        </div>
      }
    />
  );
}
