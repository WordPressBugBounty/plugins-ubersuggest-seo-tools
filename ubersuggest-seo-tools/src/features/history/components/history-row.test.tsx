import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HistoryRecord } from '../services/fix-history';
import { HistoryRow } from './history-row';

const makeRecord = (over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  id: 7,
  action: 'apply',
  issueId: 'title_long',
  ref: '25',
  field: 'title',
  pageTitle: 'Pricing',
  pageUrl: 'https://example.com/pricing/',
  pageExists: true,
  before: 'Old title',
  after: 'New title',
  restores: true,
  stale: false,
  source: 'ai',
  integration: 'native',
  user: 'admin',
  appliedAt: '2026-09-04T14:20:33+00:00',
  appliedAtSite: '2026-09-04 11:20:33',
  revertRefusal: null,
  ...over,
});

/** A <tr> needs a table around it or React drops it from the DOM. */
const renderRow = (record: HistoryRecord, onRevert = vi.fn()) => {
  const onFilterPage = vi.fn();
  render(
    <table>
      <tbody>
        <HistoryRow
          record={record}
          locale="en"
          reverting={false}
          onRevert={onRevert}
          onFilterPage={onFilterPage}
        />
      </tbody>
    </table>,
  );
  return { onRevert, onFilterPage };
};

describe('HistoryRow', () => {
  it('shows the value before the fix and the value written', () => {
    renderRow(makeRecord());

    expect(screen.getByText('Old title')).not.toBeNull();
    expect(screen.getByText('New title')).not.toBeNull();
  });

  it('names an empty value instead of leaving the cell blank', () => {
    renderRow(makeRecord({ before: '' }));

    expect(screen.getByText('(empty)')).not.toBeNull();
  });

  /** A revert writes to the live site, so the click alone must not do it. */
  it('asks first, names the value that comes back, and only then reverts', async () => {
    const user = userEvent.setup();
    const { onRevert } = renderRow(makeRecord());

    await user.click(screen.getByTestId('history-undo'));
    expect(screen.getByText('Undo this fix?')).not.toBeNull();
    expect(onRevert).not.toHaveBeenCalled();

    await user.click(screen.getByText('Cancel'));
    expect(onRevert).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('history-undo'));
    // The dialog's confirm carries the same "Undo" label as the trigger, and
    // the trigger is the testid — so the remaining match is the confirm.
    const undoButtons = screen.getAllByText('Undo');
    await user.click(undoButtons[undoButtons.length - 1]);

    expect(onRevert).toHaveBeenCalledWith(7);
  });

  /**
   * The dialog shows the EFFECTIVE value that returns, so it agrees with the
   * row's own diff instead of the raw '' a title revert actually writes.
   */
  it('shows the effective value the undo restores', async () => {
    renderRow(makeRecord({ before: 'Old title' }));

    await userEvent.click(screen.getByTestId('history-undo'));

    expect(screen.getAllByText('Old title').length).toBeGreaterThan(1);
  });

  /**
   * A replaced apply keeps showing the value it wrote; without the mark the row
   * reads as the page's current state.
   */
  it('marks a write a later one replaced', () => {
    renderRow(makeRecord({ stale: true }));

    expect(screen.getByText('Not live')).not.toBeNull();
  });

  /** A click that did not take must say why — '—' would read as "nothing happened". */
  it('names the reason a click was refused, even for superseded', () => {
    render(
      <table>
        <tbody>
          <HistoryRow
            record={makeRecord()}
            locale="en"
            reverting={false}
            failure="superseded"
            onRevert={vi.fn()}
            onFilterPage={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.queryByText('—')).toBeNull();
    expect(screen.getByText('A later change replaced this one')).not.toBeNull();
  });

  /**
   * The ordinary older row: superseded AND visibly not live, so the chip
   * already explains the missing button and a sentence would be noise.
   */
  it('stays quiet about a superseded row the chip already explains', () => {
    renderRow(makeRecord({ revertRefusal: 'superseded', stale: true }));

    expect(screen.getByText('Not live')).not.toBeNull();
    expect(screen.getByText('—')).not.toBeNull();
  });

  /**
   * The case the two flags disagree on: a later write put the SAME value back
   * (two title issues share the field), so the value IS live — no chip — while
   * the record is still not the newest and cannot be undone. Silent here would
   * read as a current row whose button vanished for no reason.
   */
  it('explains a superseded row whose value is still live', () => {
    renderRow(makeRecord({ revertRefusal: 'superseded', stale: false }));

    expect(screen.queryByText('Not live')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.getByText('A later change replaced this one')).not.toBeNull();
  });

  /** A failed request says nothing about the record, so the button stays. */
  it('keeps Undo clickable when the request itself failed', () => {
    render(
      <table>
        <tbody>
          <HistoryRow
            record={makeRecord()}
            locale="en"
            reverting={false}
            failure="request_failed"
            onRevert={vi.fn()}
            onFilterPage={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByTestId('history-undo')).not.toBeNull();
    expect(screen.getByText(/didn't go through/)).not.toBeNull();
  });

  /**
   * The no-dead-button rule: the server already decided this record cannot be
   * undone, so the row must not offer a click that would be refused.
   */
  it('replaces Undo with the reason the server refused it', () => {
    renderRow(makeRecord({ revertRefusal: 'value_changed' }));

    expect(screen.queryByTestId('history-undo')).toBeNull();
    expect(screen.getByText('Edited after the fix')).not.toBeNull();
  });

  it('reports a refused click on the row, even when the record looked undoable', () => {
    render(
      <table>
        <tbody>
          <HistoryRow
            record={makeRecord()}
            locale="en"
            reverting={false}
            failure="value_changed"
            onRevert={vi.fn()}
            onFilterPage={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.queryByTestId('history-undo')).toBeNull();
    expect(screen.getByText('Edited after the fix')).not.toBeNull();
  });

  it('keeps a deleted page readable but unlinked', () => {
    renderRow(makeRecord({ pageExists: false }));

    expect(screen.getByText('Pricing')).not.toBeNull();
    expect(screen.getByText('This page no longer exists')).not.toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  /** The label travels with the ref, so the chip need not find the row. */
  it('filters by the page whose title is clicked, label included', async () => {
    const { onFilterPage } = renderRow(makeRecord());

    await userEvent.click(screen.getByText('Pricing'));

    expect(onFilterPage).toHaveBeenCalledWith('25', 'Pricing');
  });

  /** An untitled page falls back to its URL, never to a bare post id. */
  it('labels an untitled page with its url', async () => {
    const { onFilterPage } = renderRow(makeRecord({ pageTitle: '' }));

    // The url shows twice on an untitled row, so address the trigger by role.
    await userEvent.click(
      screen.getByRole('button', { name: 'https://example.com/pricing/' }),
    );

    expect(onFilterPage).toHaveBeenCalledWith(
      '25',
      'https://example.com/pricing/',
    );
  });
});
