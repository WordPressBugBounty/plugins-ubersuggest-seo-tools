import { createTrackingModule } from './core';
import type { TrackedSurface } from './surfaces';

/**
 * Conversion events, cross-feature by nature: the same View Plans intent
 * fires from three surfaces, and `source` says which one — the paywall shown
 * to free accounts, the project-required modal, or the Settings page. The
 * value doubles as the link's `utm_content`, hence the shared vocabulary.
 */
type ConversionEvents = {
  VIEW_PLANS_CLICK: { source: TrackedSurface };
};

export const trackConversion = createTrackingModule<ConversionEvents>({
  VIEW_PLANS_CLICK: 'View Plans Click',
});
