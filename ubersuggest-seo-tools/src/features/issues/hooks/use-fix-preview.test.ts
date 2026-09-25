import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import { trackIssues } from '../../../tracking/issues';
import { ReviewAskContext } from '../../review/review-ask-context';
import type { PreviewRow } from '../types';
import { useFixPreview } from './use-fix-preview';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

// These tests are about the fix flow, not analytics — keep tracking inert.
vi.mock('../../../tracking/issues', () => ({ trackIssues: vi.fn() }));

const mockTrackIssues = vi.mocked(trackIssues);

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

const makeRow = (over: Partial<PreviewRow> = {}): PreviewRow => ({
  ref: '1',
  label: 'Page',
  before: '(none)',
  after: null,
  status: 'idle',
  source: null,
  ...over,
});

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
});

/** Renders the hook under a review-ask provider, as App does. */
const withReviewAsk =
  (askForReview: () => void) =>
  ({ children }: { children: ReactNode }) =>
    createElement(ReviewAskContext.Provider, { value: askForReview }, children);

const readyRow = (ref: string, after: string) =>
  makeRow({ ref, after, status: 'ready', source: 'ai' });

describe('useFixPreview', () => {
  it('lists idle rows and the credit balance on openPreview', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [makeRow({ ref: '1' })],
      credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
    });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());

    await waitFor(() => expect(result.current.preview).toHaveLength(1));
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining('fix/preview?issue=meta_description_empty'),
    );
    expect(result.current.credits?.remaining).toBe(10);
    expect(result.current.canAfford).toBe(true);
  });

  it('generates only the requested page and merges just that row', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1' }), makeRow({ ref: '2' })],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      .mockResolvedValueOnce({
        rows: [
          makeRow({
            ref: '2',
            after: 'New meta',
            status: 'ready',
            source: 'ai',
          }),
        ],
        credits: { used: 2, limit: 10, remaining: 8, cost: 2 },
      });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(2));

    act(() => result.current.generateRow('2'));
    await waitFor(() =>
      expect(result.current.preview?.find((r) => r.ref === '2')?.after).toBe(
        'New meta',
      ),
    );

    expect(mockApiGet).toHaveBeenLastCalledWith(
      expect.stringContaining('start=1&ref=2'),
    );
    // The other page must be untouched.
    expect(
      result.current.preview?.find((r) => r.ref === '1')?.after,
    ).toBeNull();
    // Balance refreshed from the response.
    expect(result.current.credits?.remaining).toBe(8);
  });

  it('surfaces a limit row instead of a silent fallback', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1' })],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1', status: 'limit' })],
      });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.generateRow('1'));
    await waitFor(() =>
      expect(result.current.preview?.[0].status).toBe('limit'),
    );
  });

  // Regression: generate page 1 → apply ONLY page 1 (per-card Apply) → generate
  // page 2. The second generation must merge and show, and nothing may be left
  // stuck in generating/applying state.
  it('generates another page after a single-card apply', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1' }), makeRow({ ref: '2' })],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      .mockResolvedValueOnce({
        rows: [
          makeRow({
            ref: '1',
            after: 'First title',
            status: 'ready',
            source: 'ai',
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          makeRow({
            ref: '2',
            after: 'Second title',
            status: 'ready',
            source: 'ai',
          }),
        ],
      });
    mockApiPost.mockResolvedValueOnce({ ok: true });

    const onApplied = vi.fn();
    const { result } = renderHook(() => useFixPreview('title_long', onApplied));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(2));

    act(() => result.current.generateRow('1'));
    await waitFor(() =>
      expect(result.current.preview?.find((r) => r.ref === '1')?.after).toBe(
        'First title',
      ),
    );

    act(() => result.current.applyRow('1'));
    await waitFor(() =>
      expect(result.current.preview?.find((r) => r.ref === '1')?.status).toBe(
        'fixed',
      ),
    );
    // Apply sent only page 1's value.
    expect(mockApiPost).toHaveBeenCalledWith('fix/apply', {
      issue: 'title_long',
      values: { '1': 'First title' },
      sources: { '1': 'ai' },
    });
    expect(onApplied).toHaveBeenCalledTimes(1);

    act(() => result.current.generateRow('2'));
    await waitFor(() =>
      expect(result.current.preview?.find((r) => r.ref === '2')?.after).toBe(
        'Second title',
      ),
    );
    // Page 1 stays fixed; nothing is stuck spinning.
    expect(result.current.preview?.find((r) => r.ref === '1')?.status).toBe(
      'fixed',
    );
    expect(result.current.generatingRefs).toHaveLength(0);
    expect(result.current.applyingRefs).toHaveLength(0);
  });

  // Phantom-apply protection: only pages the SERVER says it wrote turn green.
  // A page that dropped out of the target scan between preview and apply stays
  // unfixed, with a message and a list refresh.
  // The history log tells AI text and user-edited text apart, so a row the
  // user rewrote must reach the server flagged 'edited', not 'ai'.
  it('sends source edited for a row the user rewrote', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [readyRow('1', 'AI title')],
      credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
    });
    mockApiPost.mockResolvedValueOnce({ ok: true, appliedRefs: ['1'] });

    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.editRow('1', 'My own title'));
    act(() => result.current.applyRow('1'));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('fix/apply', {
        issue: 'title_long',
        values: { '1': 'My own title' },
        sources: { '1': 'edited' },
      }),
    );
  });

  // The apply response carries each written page's Undo offer, so the green
  // card can revert immediately — no drawer reopen needed to re-list the page.
  it('attaches the Undo offer from the apply response', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [readyRow('1', 'AI title')],
      credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
    });
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      appliedRefs: ['1'],
      revertOffers: { '1': { id: 4, to: 'Old title' } },
    });

    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.applyRow('1'));
    await waitFor(() =>
      expect(result.current.preview?.[0]?.status).toBe('fixed'),
    );
    expect(result.current.preview?.[0]?.revertId).toBe(4);
    expect(result.current.preview?.[0]?.revertTo).toBe('Old title');
  });

  // Undo posts the history record id; success refreshes the whole preview (the
  // page returns as a suggestion) and pings the outer list. A refusal from the
  // engine (value changed since the apply, content edited…) must surface as the
  // drawer's error — never pretend the revert happened.
  it('reverts through the history record and refreshes on success', async () => {
    const fixedRowPayload = makeRow({
      ref: '1',
      after: 'Applied',
      status: 'fixed',
      revertId: 9,
      revertTo: 'Old value',
    });
    mockApiGet
      .mockResolvedValueOnce({ rows: [fixedRowPayload] })
      // the refresh after the successful revert
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '1' })] });
    mockApiPost.mockResolvedValueOnce({ ok: true, revertRecordId: 10 });

    const onApplied = vi.fn();
    const { result } = renderHook(() => useFixPreview('title_long', onApplied));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.revertRow('1'));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('history/revert', { id: 9 }),
    );
    // Refreshed: the row is idle again (no longer fixed).
    await waitFor(() =>
      expect(result.current.preview?.[0]?.status).toBe('idle'),
    );
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a revert refusal as the error line', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [
        makeRow({
          ref: '1',
          after: 'Applied',
          status: 'fixed',
          revertId: 9,
          revertTo: 'Old value',
        }),
      ],
    });
    mockApiPost.mockResolvedValueOnce({
      ok: false,
      code: 'value_changed',
      error: 'The field was changed after this fix.',
    });

    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.revertRow('1'));
    await waitFor(() =>
      expect(result.current.error).toBe(
        'The field was changed after this fix.',
      ),
    );
    // Still fixed, and the error stands — but the dead offer is gone, so there
    // is no button left to click into the same refusal again.
    await waitFor(() =>
      expect(result.current.preview?.[0]?.revertId).toBeUndefined(),
    );
    expect(result.current.preview?.[0]?.status).toBe('fixed');
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('marks fixed only the appliedRefs the server reports', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [
          makeRow({
            ref: '1',
            after: 'Title one',
            status: 'ready',
            source: 'ai',
          }),
          makeRow({
            ref: '2',
            after: 'Title two',
            status: 'ready',
            source: 'ai',
          }),
        ],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      // the refresh triggered by the partially-applied response
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '2' })] });
    // Server wrote page 1 only — page 2 left the target scan meanwhile.
    mockApiPost.mockResolvedValueOnce({ ok: true, appliedRefs: ['1'] });

    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(2));

    act(() => result.current.applyAll());
    await waitFor(() =>
      expect(
        result.current.preview?.find((row) => row.ref === '1')?.status,
      ).toBe('fixed'),
    );
    // Page 2 must NOT be green, and the staleness is surfaced.
    expect(
      result.current.preview?.find((row) => row.ref === '2')?.status,
    ).not.toBe('fixed');
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  // Server wrote NOTHING (every requested page went stale): no green cards, no
  // fixed credit — just the message and a refresh.
  it('treats nothing_applied as a stale list, never as success', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [
          makeRow({
            ref: '1',
            after: 'Title one',
            status: 'ready',
            source: 'ai',
          }),
        ],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      .mockResolvedValueOnce({ rows: [] });
    mockApiPost.mockResolvedValueOnce({ ok: false, code: 'nothing_applied' });

    const onApplied = vi.fn();
    const { result } = renderHook(() => useFixPreview('title_long', onApplied));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.applyRow('1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(
      result.current.preview?.find((row) => row.ref === '1')?.status,
    ).not.toBe('fixed');
    expect(onApplied).not.toHaveBeenCalled();
  });

  // A settled generate response with no row for the clicked page (the backend's
  // target scan no longer lists it) must NOT die silently: it surfaces a message
  // and refreshes the list.
  it('surfaces a missing row and refreshes the list instead of a dead click', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1' }), makeRow({ ref: '2' })],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      // generate for page 2 comes back settled but WITHOUT page 2
      .mockResolvedValueOnce({ rows: [], pending: false })
      // the automatic list refresh
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '1' })] });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(2));

    act(() => result.current.generateRow('2'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.generatingRefs).toHaveLength(0);
    // The list refresh dropped the no-longer-flagged page.
    await waitFor(() => expect(result.current.preview).toHaveLength(1));
  });

  it('blocks generation when the balance is below the cost', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [makeRow({ ref: '1' })],
      credits: { used: 9, limit: 10, remaining: 1, cost: 2 },
    });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());

    await waitFor(() => expect(result.current.credits).not.toBeNull());
    expect(result.current.canAfford).toBe(false);
  });

  it('reports a lost account instead of leaving the drawer blank', async () => {
    mockApiGet.mockResolvedValueOnce({ notConnected: true, expired: true });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain('Reconnect');
    expect(result.current.preview).toBeNull();
    expect(result.current.opening).toBe(false);
  });

  it('stops a page generating when the account dies mid-flight', async () => {
    mockApiGet
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '1' })] })
      .mockResolvedValueOnce({ notConnected: true, expired: true });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.generateRow('1'));

    await waitFor(() => expect(result.current.generatingRefs).toHaveLength(0));
    expect(result.current.error).not.toBeNull();
  });

  it('keeps a fixed card fixed when the fresh list demotes it', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1', status: 'fixed', after: 'Applied title' })],
      })
      // Reopen: the server's cached suggestion resurfaces the page as 'ready'.
      .mockResolvedValueOnce({
        rows: [
          makeRow({ ref: '1', status: 'ready', after: 'Cached suggestion' }),
        ],
      });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.cancelPreview());
    act(() => result.current.openPreview());

    await waitFor(() => expect(result.current.opening).toBe(false));
    expect(result.current.preview?.[0]?.status).toBe('fixed');
    expect(result.current.preview?.[0]?.after).toBe('Applied title');
  });

  it('carries the free-plan flag from the list step', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [makeRow({ ref: '1' })],
      freePlan: true,
    });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());

    await waitFor(() => expect(result.current.freePlan).toBe(true));
  });

  it('opens the paywall instead of generating on a free plan', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [makeRow({ ref: '1' })],
      freePlan: true,
    });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.freePlan).toBe(true));

    act(() => result.current.generateRow('1'));

    expect(result.current.freePaywall).toBe(true);
    // Only the list call happened — the chargeable kick-off never fired.
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('retries with a fresh verdict after the upgrade CTA', async () => {
    mockApiGet
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '1' })], freePlan: true })
      .mockResolvedValueOnce({
        rows: [makeRow({ ref: '1', status: 'pending' })],
        pending: true,
      });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.freePlan).toBe(true));

    act(() => result.current.markUpgradeAttempted());
    act(() => result.current.generateRow('1'));

    // The kick-off went through, asking the server to re-check the plan…
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
    expect(mockApiGet.mock.calls[1][0]).toContain('refresh_plan=1');
    // …and an allowed chargeable call clears the stale local flag.
    await waitFor(() => expect(result.current.freePlan).toBe(false));
    expect(result.current.freePaywall).toBe(false);
  });

  it('reopens the paywall when the server refuses the kick-off', async () => {
    mockApiGet
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '1' })] })
      .mockResolvedValueOnce({ rows: [], pending: false, freePlan: true });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.generateRow('1'));

    await waitFor(() => expect(result.current.freePaywall).toBe(true));
    expect(result.current.freePlan).toBe(true);
    expect(result.current.generatingRefs).toHaveLength(0);
  });

  it('surfaces the project CTA when no UBS project can back the AI', async () => {
    const projectRequired = {
      domain: 'example.com',
      manageProjectsUrl: 'https://ubs.example/en/project/settings',
      upgradeUrl: 'https://ubs.example/en/pricing',
    };
    mockApiGet
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '1' })] })
      .mockResolvedValueOnce({ rows: [], projectRequired });

    const { result } = renderHook(() =>
      useFixPreview('meta_description_empty', vi.fn()),
    );
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.generateRow('1'));

    await waitFor(() =>
      expect(result.current.projectCta).toEqual(projectRequired),
    );
    // A structural block, not a transient failure: no error line, no spinner,
    // and no fallback text masquerading as a suggestion.
    expect(result.current.error).toBeNull();
    expect(result.current.generatingRefs).toHaveLength(0);
    expect(result.current.preview?.[0]?.after).toBeNull();
  });

  // The review ask rides the apply response: only the server knows whether this
  // was the user's first fix, so the hook must not decide it locally.
  it('asks for a review when apply says this was the first fix', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [readyRow('1', 'Title one')],
      credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
    });
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      appliedRefs: ['1'],
      shouldAskForReview: true,
    });

    const askForReview = vi.fn();
    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()), {
      wrapper: withReviewAsk(askForReview),
    });
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.applyRow('1'));

    await waitFor(() => expect(askForReview).toHaveBeenCalledTimes(1));
  });

  // An apply that only partly landed puts an error line on screen; a
  // celebration four seconds later would contradict it.
  it('holds the review ask back when the apply only partly landed', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [readyRow('1', 'Title one'), readyRow('2', 'Title two')],
        credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
      })
      // the refresh triggered by the partially-applied response
      .mockResolvedValueOnce({ rows: [makeRow({ ref: '2' })] });
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      appliedRefs: ['1'],
      shouldAskForReview: true,
    });

    const askForReview = vi.fn();
    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()), {
      wrapper: withReviewAsk(askForReview),
    });
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(2));

    act(() => result.current.applyAll());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(askForReview).not.toHaveBeenCalled();
  });

  it('stays quiet on the applies after that', async () => {
    mockApiGet.mockResolvedValueOnce({
      rows: [readyRow('1', 'Title one')],
      credits: { used: 0, limit: 10, remaining: 10, cost: 2 },
    });
    mockApiPost.mockResolvedValueOnce({ ok: true, appliedRefs: ['1'] });

    const askForReview = vi.fn();
    const { result } = renderHook(() => useFixPreview('title_long', vi.fn()), {
      wrapper: withReviewAsk(askForReview),
    });
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.applyRow('1'));

    await waitFor(() =>
      expect(result.current.preview?.[0]?.status).toBe('fixed'),
    );
    expect(askForReview).not.toHaveBeenCalled();
  });
});

describe('the generate funnel event', () => {
  it('reports a real attempt as unblocked, with the issue and the action', async () => {
    mockApiGet
      .mockResolvedValueOnce({
        rows: [
          {
            ref: '1',
            label: 'A',
            before: 'x',
            after: null,
            status: 'idle',
            source: null,
          },
        ],
      })
      .mockResolvedValueOnce({ pending: false, rows: [] });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.preview).toHaveLength(1));

    act(() => result.current.regenerateRow('1'));

    expect(mockTrackIssues).toHaveBeenCalledWith('GENERATE_SUGGESTION_CLICK', {
      issue: 'title_empty',
      action: 'regenerate',
      blocked: false,
    });
  });

  it('still reports a click the paywall took, so the funnel keeps its denominator', async () => {
    mockApiGet.mockResolvedValueOnce({
      freePlan: true,
      rows: [
        {
          ref: '1',
          label: 'A',
          before: 'x',
          after: null,
          status: 'idle',
          source: null,
        },
      ],
    });

    const { result } = renderHook(() => useFixPreview('title_empty', vi.fn()));
    act(() => result.current.openPreview());
    await waitFor(() => expect(result.current.freePlan).toBe(true));
    mockTrackIssues.mockClear();

    act(() => result.current.generateRow('1'));

    expect(result.current.freePaywall).toBe(true);
    expect(mockTrackIssues).toHaveBeenCalledWith('GENERATE_SUGGESTION_CLICK', {
      issue: 'title_empty',
      action: 'generate',
      blocked: true,
    });
  });
});
