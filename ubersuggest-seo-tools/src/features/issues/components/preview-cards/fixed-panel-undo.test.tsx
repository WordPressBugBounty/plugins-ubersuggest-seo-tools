import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PreviewRow } from '../../types';
import { FixedPanel } from './fixed-panel';

const fixedRow = (over: Partial<PreviewRow> = {}): PreviewRow => ({
  ref: '25',
  label: 'Page',
  before: '(none)',
  after: 'Applied title',
  status: 'fixed',
  source: null,
  ...over,
});

describe('FixedPanel undo', () => {
  it('offers Undo only when the row carries a revertable record', () => {
    const { rerender } = render(
      <FixedPanel row={fixedRow()} recrawling={false} onRecrawl={vi.fn()} />,
    );
    expect(screen.queryByTestId('fix-undo')).toBeNull();

    rerender(
      <FixedPanel
        row={fixedRow({ revertId: 7, revertTo: 'Old title' })}
        recrawling={false}
        onRecrawl={vi.fn()}
        onRevert={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fix-undo')).toBeDefined();
  });

  it('asks first, shows the value that comes back, and only then reverts', async () => {
    const user = userEvent.setup();
    const onRevert = vi.fn();
    render(
      <FixedPanel
        row={fixedRow({ revertId: 7, revertTo: 'Old title' })}
        recrawling={false}
        onRecrawl={vi.fn()}
        onRevert={onRevert}
      />,
    );

    await user.click(screen.getByTestId('fix-undo'));
    expect(screen.getByText('Undo this fix?')).toBeDefined();
    expect(screen.getByText('Old title')).toBeDefined();
    expect(onRevert).not.toHaveBeenCalled();

    await user.click(screen.getByText('Cancel'));
    expect(onRevert).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('fix-undo'));
    // The dialog's confirm button carries the same "Undo" label as the trigger;
    // the trigger is the testid, so the remaining match is the confirm.
    const buttons = screen.getAllByText('Undo');
    await user.click(buttons[buttons.length - 1]);
    expect(onRevert).toHaveBeenCalledWith('25');
  });
});
