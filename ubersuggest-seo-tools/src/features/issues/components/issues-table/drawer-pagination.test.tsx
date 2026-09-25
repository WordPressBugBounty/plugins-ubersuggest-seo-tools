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
  count: 12,
  level: 'warnings',
  seoImpact: 'medium',
  difficulty: 'easy',
  fix: {
    state: 'fixable',
    message: '12 titles are too long.',
    previewable: true,
  },
};

// Twelve affected pages: three drawer pages at the dashboard's 5-per-page size.
const rows = Array.from({ length: 12 }, (_, index) => ({
  ref: String(index + 1),
  label: `Page ${index + 1}`,
  url: `https://example.com/${index + 1}/`,
  before: `Old long title ${index + 1}`,
  after: null,
  status: 'idle',
  source: null,
}));

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiGet.mockResolvedValue({
    rows,
    pending: false,
    credits: { used: 0, limit: 1000, remaining: 757, cost: 2 },
  });
});

describe('drawer footer pagination', () => {
  it('shows five cards per page and swaps the slice on page change', async () => {
    const user = userEvent.setup();

    render(
      <table>
        <tbody>
          <IssueRow issue={issue} onChanged={() => {}} />
        </tbody>
      </table>,
    );

    await user.click(screen.getByText('Fix it'));
    await waitFor(() => expect(screen.getByText('Page 1')).toBeDefined());

    // First page: rows 1–5 only.
    expect(screen.getByText('Page 5')).toBeDefined();
    expect(screen.queryByText('Page 6')).toBeNull();

    // Three pages for twelve rows.
    expect(screen.getByTestId('pagination-page-3')).toBeDefined();
    expect(screen.queryByTestId('pagination-page-4')).toBeNull();

    await user.click(screen.getByTestId('pagination-page-2'));
    await waitFor(() => expect(screen.getByText('Page 6')).toBeDefined());
    expect(screen.getByText('Page 10')).toBeDefined();
    expect(screen.queryByText('Page 1')).toBeNull();

    // Last page holds the remaining two rows.
    await user.click(screen.getByTestId('pagination-page-3'));
    await waitFor(() => expect(screen.getByText('Page 11')).toBeDefined());
    expect(screen.getByText('Page 12')).toBeDefined();
    expect(screen.queryByText('Page 10')).toBeNull();
  });

  it('leaves the footer unpaginated when one page covers every row', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({
      rows: rows.slice(0, 4),
      pending: false,
      credits: { used: 0, limit: 1000, remaining: 757, cost: 2 },
    });

    render(
      <table>
        <tbody>
          <IssueRow issue={issue} onChanged={() => {}} />
        </tbody>
      </table>,
    );

    await user.click(screen.getByText('Fix it'));
    await waitFor(() => expect(screen.getByText('Page 4')).toBeDefined());
    expect(screen.queryByTestId('pagination-nav')).toBeNull();
  });
});
