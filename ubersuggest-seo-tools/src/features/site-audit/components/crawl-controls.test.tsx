import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuditProvider } from '../audit-context';
import type { Audit } from '../types';
import { CrawlControls } from './crawl-controls';

const AUDIT: Audit = {
  domain: 'exemplo.com',
  lastCrawl: 'May 1, 2026 10:00 AM',
  overview: { seoScore: 80 },
  pagesCrawled: 10,
  blocked: 0,
  pageStatus: { successful: 10, redirected: 0, broken: 0, blocked: 0 },
  totalIssues: 0,
  topIssues: [],
};

function renderControls({
  reload = () => {},
  reloading = false,
}: {
  reload?: () => void;
  reloading?: boolean;
}) {
  return render(
    <AuditProvider audit={AUDIT} reload={reload} reloading={reloading}>
      <CrawlControls />
    </AuditProvider>,
  );
}

describe('CrawlControls', () => {
  it('starts a recrawl on click', async () => {
    const reload = vi.fn();
    renderControls({ reload });

    await userEvent.click(
      screen.getByRole('button', { name: 'Recrawl website' }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  /**
   * The progress screen only replaces the page once the trigger request
   * resolves as pending; until then the button is still on screen, and every
   * extra click in that window fired another crawl trigger at the backend.
   * Same shape as the web app's Recrawl: DS `loading` spinner, static label.
   */
  it('locks the button once a recrawl is running', () => {
    renderControls({ reloading: true });

    expect(
      screen.getByRole('button', { name: 'Recrawl website' }),
    ).toBeDisabled();
  });

  it('swallows a second click while a recrawl is running', async () => {
    const reload = vi.fn();
    renderControls({ reload, reloading: true });

    await userEvent.click(
      screen.getByRole('button', { name: 'Recrawl website' }),
    );

    expect(reload).not.toHaveBeenCalled();
  });
});
