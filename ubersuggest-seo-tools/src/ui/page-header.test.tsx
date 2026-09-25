import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    render(<PageHeader title="nav_settings" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).not.toBeNull();
  });

  it('leaves out the (i) when the page has no hint', () => {
    render(<PageHeader title="nav_settings" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('places the tabs under the title, inside the header block', () => {
    render(
      <PageHeader
        title="nav_seo_issues"
        hint="issues_discovered_hint"
        tabs={<div data-testid="tabs" />}
      />,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    const tabs = screen.getByTestId('tabs');
    // Same container, heading first: what makes every page's header line up.
    expect(heading.closest('div')?.parentElement).toBe(tabs.parentElement);
    expect(
      heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
