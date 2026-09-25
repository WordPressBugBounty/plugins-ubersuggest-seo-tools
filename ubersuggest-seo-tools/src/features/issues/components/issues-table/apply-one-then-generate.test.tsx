import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../../api';
import type { Issue } from '../../types';
import { IssueRow } from './issue-row';

vi.mock('../../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

// These tests are about the fix flow, not analytics - keep tracking inert.
vi.mock('../../../../tracking/issues', () => ({ trackIssues: vi.fn() }));
vi.mock('../../../../tracking/conversion', () => ({
  trackConversion: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

const issue: Issue = {
  id: 'title_long',
  label: 'Title tag too long',
  count: 2,
  level: 'warnings',
  seoImpact: 'medium',
  difficulty: 'easy',
  fix: {
    state: 'fixable',
    message: '2 titles are too long.',
    previewable: true,
  },
};

const row = (ref: string, over: Record<string, unknown> = {}) => ({
  ref,
  label: `Page ${ref}`,
  url: `https://example.com/${ref}/`,
  before: `Old long title ${ref}`,
  after: null,
  status: 'idle',
  source: null,
  ...over,
});

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
});

// Regression for the reported bug: generate page A, apply ONLY page A via the
// per-card Apply, then click Generate on page B. B's suggestion must appear.
describe('per-card apply then generate another page', () => {
  it('shows the second suggestion after a single-card apply', async () => {
    const user = userEvent.setup();

    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('start=1&ref=25')) {
        return Promise.resolve({
          rows: [
            row('25', { after: 'New title A', status: 'ready', source: 'ai' }),
          ],
          pending: false,
        });
      }
      if (path.includes('start=1&ref=24')) {
        return Promise.resolve({
          rows: [
            row('24', { after: 'New title B', status: 'ready', source: 'ai' }),
          ],
          pending: false,
        });
      }
      // list step (drawer open)
      return Promise.resolve({
        rows: [row('25'), row('24')],
        pending: false,
        credits: { used: 0, limit: 1000, remaining: 757, cost: 2 },
      });
    });
    mockApiPost.mockResolvedValue({ ok: true });

    render(
      <table>
        <tbody>
          <IssueRow issue={issue} onChanged={() => {}} />
        </tbody>
      </table>,
    );

    // Open the drawer and wait for the two page cards.
    await user.click(screen.getByText('Fix it'));
    await waitFor(() => expect(screen.getByText('Page 25')).toBeDefined());
    expect(screen.getByText('Page 24')).toBeDefined();

    // Generate page A.
    const generateButtons = screen.getAllByText(/Generate \(2\)/);
    expect(generateButtons).toHaveLength(2);
    await user.click(generateButtons[0]);
    await waitFor(() => expect(screen.getByText('New title A')).toBeDefined());

    // Apply ONLY page A via the per-card Apply.
    await user.click(screen.getByText('Apply'));
    await waitFor(() => expect(screen.getByText('Fixed')).toBeDefined());
    expect(mockApiPost).toHaveBeenCalledWith('fix/apply', {
      issue: 'title_long',
      values: { '25': 'New title A' },
      sources: { '25': 'ai' },
    });

    // Generate page B — the reported dead click.
    const remainingGenerate = screen.getAllByText(/Generate \(2\)/);
    expect(remainingGenerate).toHaveLength(1);
    await user.click(remainingGenerate[0]);
    await waitFor(() => expect(screen.getByText('New title B')).toBeDefined());
  });
});
