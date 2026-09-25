import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../../api';
import { DRAWER_Z_INDEX } from '../../../../ui/side-drawer';
import type { Issue } from '../../types';
import { IssueRow } from './issue-row';

vi.mock('../../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  config: () => ({ restUrl: '', nonce: '', lang: 'en' }),
}));

// These tests are about the drawer header, not analytics — keep tracking inert.
vi.mock('../../../../tracking/issues', () => ({ trackIssues: vi.fn() }));
vi.mock('../../../../tracking/conversion', () => ({
  trackConversion: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);

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

const EXPLAINER_LABEL = 'What is this and how do I fix it?';

beforeEach(() => {
  vi.mocked(apiPost).mockReset();
  mockApiGet.mockReset();
  mockApiGet.mockResolvedValue({ rows: [], pending: false });
});

// The drawer used to dead-end: it listed the affected pages with no word on
// what the issue actually is. The dashboard's breakdown section carries the
// explainer next to its title, so ours does too.
describe('issue explainer inside the drawer', () => {
  it('offers the explainer in the drawer header, not only on the row', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <IssueRow issue={issue} onChanged={() => {}} />
        </tbody>
      </table>,
    );

    expect(screen.getAllByText(EXPLAINER_LABEL)).toHaveLength(1);

    await user.click(screen.getByText('Fix it'));

    await waitFor(() =>
      expect(screen.getAllByText(EXPLAINER_LABEL)).toHaveLength(2),
    );
  });

  it('heads the drawer with the issue description and affected count', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <IssueRow issue={issue} onChanged={() => {}} />
        </tbody>
      </table>,
    );

    await user.click(screen.getByText('Fix it'));

    // Generic heading + the specifics on the line under it, as the dashboard's
    // code-fix-modal does. The label itself never appears twice.
    expect(await screen.findByText('SEO Issue')).not.toBeNull();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          'with a title tag that is too long — 2 pages affected',
      ),
    ).not.toBeNull();
  });

  it('stacks the popover above the drawer instead of behind it', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <IssueRow issue={issue} onChanged={() => {}} />
        </tbody>
      </table>,
    );

    await user.click(screen.getByText('Fix it'));
    const triggers = await screen.findAllByText(EXPLAINER_LABEL);
    // The drawer's copy is the second one — the row renders first.
    await user.click(triggers[1]);

    // The DS ships `z-60` on PopoverContent, which the drawer's z-index would
    // bury. Assert the inline override that outranks it.
    const panel = await screen.findByText('What is this?');
    const content = panel.closest('[data-slot="popover-content"]');
    expect(content).not.toBeNull();
    expect((content as HTMLElement).style.zIndex).toBe(
      String(DRAWER_Z_INDEX + 1),
    );
  });
});
