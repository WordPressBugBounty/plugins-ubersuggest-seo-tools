import { createContext, useContext } from 'react';

/**
 * Lets the fix flow ask for the review prompt without knowing where it lives.
 *
 * Applying a fix happens deep inside the issues table, while the prompt is owned
 * by App: the drawer it was applied from can be closed — or the page switched —
 * during the delay before the ask, which would unmount a locally held timer. The
 * default is a no-op, so the fix hook still works outside the provider (tests).
 */
export const ReviewAskContext = createContext<() => void>(() => {});

export const useReviewAsk = () => useContext(ReviewAskContext);
