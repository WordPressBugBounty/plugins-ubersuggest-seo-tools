import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Issue } from '../../types';
import { IssueRow } from './issue-row';

// This file only asserts on rendered text, so nothing fires today — but the
// trackers close over the real apiPost, and the first test here that clicks
// would reach the network instead of failing readably.
vi.mock('../../../../tracking/issues', () => ({ trackIssues: vi.fn() }));
vi.mock('../../../../tracking/conversion', () => ({
  trackConversion: vi.fn(),
}));

const fixableIssue: Issue = {
  id: 'title_long',
  label: 'Title tag too long',
  count: 563,
  level: 'warnings',
  seoImpact: 'medium',
  difficulty: 'easy',
  fix: {
    state: 'fixable',
    message: '37 titles are too long.',
    previewable: true,
  },
};

// The exact prod /issues payload the user pasted.
const prodIssues: Issue[] = [
  {
    id: 'page_allowed',
    label: 'Blocked from appearing in search engines',
    count: 1,
    level: 'errors',
    seoImpact: 'high',
    difficulty: 'moderate',
    fix: {
      state: 'ok',
      message: 'Search engines are allowed to index the site.',
      previewable: true,
    },
  },
  {
    id: 'time_load_high',
    label: 'Long load time',
    count: 1,
    level: 'errors',
    seoImpact: 'high',
    difficulty: 'hard',
    fix: null,
  },
  {
    id: 'title_long',
    label: 'Title tag too long',
    count: 563,
    level: 'warnings',
    seoImpact: 'medium',
    difficulty: 'easy',
    fix: {
      state: 'fixable',
      message: '37 titles are too long.',
      previewable: true,
    },
  },
  {
    id: 'seo_non_friendly_url',
    label: 'Poorly formatted URL for SEO',
    count: 9,
    level: 'warnings',
    seoImpact: 'medium',
    difficulty: 'easy',
    fix: {
      state: 'fixable',
      message: '9 URLs are not SEO-friendly.',
      previewable: true,
    },
  },
];

describe('IssueRow', () => {
  it('renders a Fix it button for a fixable, previewable issue', () => {
    render(
      <table>
        <tbody>
          <IssueRow issue={fixableIssue} onChanged={() => {}} />
        </tbody>
      </table>,
    );
    expect(screen.queryByText('Fix it')).not.toBeNull();
  });

  it('renders the whole prod list without a row breaking the fix buttons', () => {
    render(
      <table>
        <tbody>
          {prodIssues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onChanged={() => {}} />
          ))}
        </tbody>
      </table>,
    );
    // Two fixable issues → two "Fix it" buttons; one manual → "View pages".
    expect(screen.getAllByText('Fix it').length).toBe(2);
    expect(screen.queryByText('View pages')).not.toBeNull();
    expect(screen.queryByText('Resolved')).not.toBeNull();
  });
});
