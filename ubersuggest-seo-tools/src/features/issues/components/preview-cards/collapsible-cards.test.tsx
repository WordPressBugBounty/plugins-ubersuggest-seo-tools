import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PreviewRow } from '../../types';
import { PreviewCards } from './preview-cards';

const row = (ref: string, over: Partial<PreviewRow> = {}): PreviewRow => ({
  ref,
  label: `Page ${ref}`,
  url: `https://example.com/${ref}/`,
  before: `Old title ${ref}`,
  after: null,
  status: 'idle',
  source: null,
  ...over,
});

const noop = () => {};

function renderCards(rows: PreviewRow[]) {
  return render(
    <PreviewCards
      rows={rows}
      generatingRefs={[]}
      applyingRefs={[]}
      recrawlingRefs={[]}
      verdicts={{}}
      canAfford={true}
      canApply={true}
      cost={2}
      maxChars={60}
      emptyValueKey="no_value"
      onGenerate={noop}
      onRegenerate={noop}
      onEdit={noop}
      onApply={noop}
      onRecrawl={noop}
    />,
  );
}

/**
 * The card's collapsible region, reached the way a screen reader would: from
 * the title button's aria-controls.
 */
function panelOf(title: string) {
  const controls = screen
    .getByRole('button', { name: title })
    .getAttribute('aria-controls');
  const panel = controls && document.getElementById(controls);
  if (!panel) throw new Error(`No panel wired to "${title}"`);
  return panel;
}

describe('collapsible preview cards', () => {
  it('starts every card collapsed', () => {
    renderCards([row('1'), row('2')]);

    for (const button of screen.getAllByRole('button', { name: /^Page/ })) {
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
    expect(panelOf('Page 1').style.gridTemplateRows).toBe('0fr');
  });

  it('expands the hovered card', async () => {
    const user = userEvent.setup();
    renderCards([row('1'), row('2')]);

    await user.hover(screen.getByText('Page 1'));

    expect(
      screen
        .getByRole('button', { name: 'Page 1' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(panelOf('Page 1').style.gridTemplateRows).toBe('1fr');
  });

  it('keeps only one card open — hovering the next closes the last', async () => {
    const user = userEvent.setup();
    renderCards([row('1'), row('2')]);

    await user.hover(screen.getByText('Page 1'));
    await user.hover(screen.getByText('Page 2'));

    expect(panelOf('Page 1').style.gridTemplateRows).toBe('0fr');
    expect(panelOf('Page 2').style.gridTemplateRows).toBe('1fr');
  });

  it('does not collapse when the pointer merely leaves the card', async () => {
    const user = userEvent.setup();
    renderCards([row('1')]);

    await user.hover(screen.getByText('Page 1'));
    await user.unhover(screen.getByText('Page 1'));

    // Nothing else took over, so the card a user was working in stays open.
    expect(panelOf('Page 1').style.gridTemplateRows).toBe('1fr');
  });

  it('flags a collapsed card that already has a suggestion', () => {
    renderCards([row('1', { after: 'A generated title', status: 'ready' })]);

    expect(screen.queryByText('Suggestion Available')).not.toBeNull();
  });

  it('drops the flag once the card is open, where the suggestion is visible', async () => {
    const user = userEvent.setup();
    renderCards([row('1', { after: 'A generated title', status: 'ready' })]);

    await user.hover(screen.getByText('Page 1'));

    expect(screen.queryByText('Suggestion Available')).toBeNull();
    expect(screen.queryByText('A generated title')).not.toBeNull();
  });
});
