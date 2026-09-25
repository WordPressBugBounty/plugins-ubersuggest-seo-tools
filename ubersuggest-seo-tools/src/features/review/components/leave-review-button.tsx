import { Button, Text } from '@ui';

import { RocketIcon } from '../../../icons';
import { REVIEW_URL } from '../review-url';

/**
 * Permanent entry point to the review form, in the sidebar footer.
 *
 * A plain anchor under DS Button (asChild): the target is outside wp-admin and
 * we render inside an iframe, so it has to open in a new tab.
 */
export function LeaveReviewButton() {
  return (
    <Button asChild variant="neutral-outline" className="w-full">
      <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer">
        <RocketIcon size={16} />
        <Text size="sm" weight="medium" text="leave_review" />
      </a>
    </Button>
  );
}
