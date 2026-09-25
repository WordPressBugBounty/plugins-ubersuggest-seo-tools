import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import type { Audit } from '../types';
import SiteAudit from './site-audit';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

const REPORT: Audit = {
  domain: 'exemplo.com',
  lastCrawl: 'May 1, 2026 10:00 AM',
  overview: { seoScore: 80 },
  pagesCrawled: 10,
  blocked: 0,
  pageStatus: { successful: 10, redirected: 0, broken: 0, blocked: 0 },
  totalIssues: 0,
  topIssues: [],
};

/** What the audit route answers next; the side reads stay empty throughout. */
let auditReply: unknown = REPORT;

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  auditReply = REPORT;
  mockApiGet.mockImplementation((path: string) =>
    path.startsWith('audit')
      ? Promise.resolve(auditReply)
      : Promise.resolve({}),
  );
});

/** Load the report, start a recrawl, and stop at the progress screen. */
async function crawlingOverAReport() {
  render(<SiteAudit />);
  await screen.findByText(/exemplo\.com/);

  auditReply = { pending: true, crawlCount: 7 };
  await act(async () => {
    await userEvent.click(
      screen.getByRole('button', { name: 'Recrawl website' }),
    );
  });
  await screen.findByRole('button', { name: 'Cancel crawl' });
}

describe('SiteAudit, cancelling over a report already on screen', () => {
  /**
   * `reportUnavailable` means the crawl stopped but the fallback read failed —
   * it travels as `noReport`, and on this path a report is still in state from
   * before the recrawl. That report IS the last completed crawl, so the page
   * must show it instead of announcing there is nothing to show.
   */
  it('shows the previous report when the fallback read fails', async () => {
    await crawlingOverAReport();
    mockApiPost.mockResolvedValue({ stopped: true, reportUnavailable: true });

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Cancel crawl' }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText(/exemplo\.com/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Crawl cancelled')).not.toBeInTheDocument();
  });

  /** With nothing ever crawled there is no report to prefer, so the screen stands. */
  it('still lands on the cancelled screen when nothing was ever crawled', async () => {
    auditReply = { pending: true, crawlCount: 7 };
    render(<SiteAudit />);
    await screen.findByRole('button', { name: 'Cancel crawl' });
    mockApiPost.mockResolvedValue({ stopped: true, noReport: true });

    await act(async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Cancel crawl' }),
      );
    });

    expect(await screen.findByText('Crawl cancelled')).toBeInTheDocument();
  });
});
