import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiPost } from '../../../api';
import { useReviewPrompt } from './use-review-prompt';

vi.mock('../../../api', () => ({ apiPost: vi.fn() }));

const mockApiPost = vi.mocked(apiPost);

beforeEach(() => {
  vi.useFakeTimers();
  mockApiPost.mockReset();
  mockApiPost.mockResolvedValue({ ok: true });
});

afterEach(() => vi.useRealTimers());

describe('useReviewPrompt', () => {
  it('holds the ask back for four seconds after the fix', () => {
    const { result } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.open).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.open).toBe(true);
  });

  // The one ask we get must not be spent on a modal nobody saw, so the server
  // only hears about it once the prompt is actually on screen.
  it('records the ask when the prompt opens, not when it is scheduled', () => {
    const { result } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    expect(mockApiPost).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(4000));
    expect(mockApiPost).toHaveBeenCalledWith('review-prompt', {});
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('asks once when several applies land together', () => {
    const { result } = renderHook(() => useReviewPrompt());

    act(() => {
      result.current.scheduleAsk();
      result.current.scheduleAsk();
      result.current.scheduleAsk();
    });
    act(() => vi.advanceTimersByTime(4000));

    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  // Applies are per-ref, so a second one can settle after the modal opened,
  // still carrying askReview — the ask the user just dismissed must not return.
  it('does not come back after the user dismissed it', () => {
    const { result } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.close());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));

    expect(result.current.open).toBe(false);
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  // The POST is the only record of the ask, so a failed one (expired nonce in a
  // long-lived iframe tab) must not turn every later apply into a new prompt.
  it('stays quiet for the rest of the session when recording the ask fails', () => {
    mockApiPost.mockRejectedValue(new Error('nonce expired'));
    const { result } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.close());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));

    expect(result.current.open).toBe(false);
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  // The drawer's edit mode is a textarea the user is typing their own title
  // into; a focus-trapping modal on top of it loses the word in progress.
  it('does not interrupt a field the user is typing in', () => {
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    const { result } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));

    expect(result.current.open).toBe(false);
    expect(mockApiPost).not.toHaveBeenCalled();

    // The ask was never recorded, so the next fix gets to make it.
    field.blur();
    field.remove();
    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));

    expect(result.current.open).toBe(true);
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('drops a pending ask when the app unmounts', () => {
    const { result, unmount } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    unmount();
    act(() => vi.advanceTimersByTime(4000));

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('closes the prompt on dismiss', () => {
    const { result } = renderHook(() => useReviewPrompt());

    act(() => result.current.scheduleAsk());
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.close());

    expect(result.current.open).toBe(false);
  });
});
