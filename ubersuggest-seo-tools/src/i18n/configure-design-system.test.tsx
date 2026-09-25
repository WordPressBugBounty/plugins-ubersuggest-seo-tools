import { render, screen } from '@testing-library/react';
import { Text, translate } from '@ui';
import { describe, expect, it } from 'vitest';

import { dynamicKey, translateDynamic } from './translate-dynamic';

// The DS translates a `text` key through the function the app injects with
// configureText (wired in src/test/setup.ts, mirroring main.tsx). Without that
// wiring the DS returns the raw key, so this asserts the engine is actually on —
// the guard for every `<Text text="…" />` call site in the app.
describe('design-system text prop', () => {
  it('renders the translated string for a catalog key', () => {
    render(<Text text="view_details" />);
    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('renders through a different element via `as`', () => {
    render(
      <table>
        <thead>
          <tr>
            <Text as="th" text="col_impact" />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader')).toHaveTextContent('Impact');
  });
});

// The design system passes variables positionally, so the catalog addresses them
// as {0}, {1}. These guard the whole chain: DS translate → our injected `call` →
// use-intl → catalog.
describe('translate from the design system', () => {
  it('substitutes a positional variable', () => {
    expect(translate('credits_left', 7)).toBe('7 credits left');
  });

  it('picks the right plural branch', () => {
    expect(translate('pages_count', 1)).toBe('1 page');
    expect(translate('pages_count', 4)).toBe('4 pages');
  });

  // Emphasis stays a STRING here on purpose: the design system's Text runs
  // parseTags over it downstream. Children position would show the tags as
  // literal text, which is why the two messages with emphasis use `text=`.
  it('keeps emphasis tags in the returned string for parseTags', () => {
    expect(translate('pages_crawled_summary', '10', '2')).toBe(
      "We've crawled <b>10</b> pages and found <b>2</b> blocked pages.",
    );
  });

  it('renders emphasis as real <b> elements through the text prop', () => {
    const { container } = render(
      <Text
        text="pages_crawled_summary"
        translationConfig={{
          translationVariables: ['10', '2'],
          boldClassName: 'font-semibold text-zinc-700',
        }}
      />,
    );
    const bold = container.querySelectorAll('b');
    expect(Array.from(bold).map((node) => node.textContent)).toEqual([
      '10',
      '2',
    ]);
    // The per-call-site class is what lets each message keep its own shade.
    expect(bold[0]).toHaveClass('font-semibold', 'text-zinc-700');
    expect(screen.getByText(/blocked pages/)).toBeInTheDocument();
  });

  it('translates a runtime-built key through translateDynamic', () => {
    expect(translateDynamic('status_blocked')).toBe('Blocked');
  });

  // An element as an interpolation value is outside use-intl's typed value union
  // (string | number | Date), so richValues carries a @ts-expect-error for it —
  // the same suppression ubersuggest-next uses to put a link inside a sentence.
  // These assert the runtime behaviour that justifies it, through the real path:
  // DS Text → our `call` → use-intl rich → back through Text's node branch.
  describe('an element as an interpolation value', () => {
    const link = (
      <a key="link" href="https://example.com">
        this guide
      </a>
    );

    it('interpolates the element and keeps the surrounding copy', () => {
      const { container } = render(
        <Text
          text="couldnt_load_audit"
          translationConfig={{ translationVariables: [link] }}
        />,
      );
      const anchor = container.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBe('https://example.com');
      expect(container.textContent).toBe(
        "Couldn't load the site audit: this guide",
      );
    });

    it('renders emphasis from the tag handler on this path, not boldClassName', () => {
      // parseTags never runs for a node return, so <b> in the catalog has to be
      // resolved by the rich handler — with the adapter's own class.
      const { container } = render(
        <Text
          text="pages_crawled_summary"
          translationConfig={{
            translationVariables: [link, '2'],
            boldClassName: 'text-zinc-700',
          }}
        />,
      );
      const bold = container.querySelectorAll('b');
      expect(bold).toHaveLength(2);
      expect(bold[0]).toHaveClass('font-semibold');
      expect(bold[0]).not.toHaveClass('text-zinc-700');
      expect(container.querySelector('a')?.textContent).toBe('this guide');
    });

    it('leaves the primitive-only paths returning a string', () => {
      expect(typeof translate('credits_left', 7)).toBe('string');
      expect(typeof translate('view_details')).toBe('string');
      expect(typeof translate('pages_crawled_summary', '10', '2')).toBe(
        'string',
      );
    });
  });

  it('accepts a runtime-built key on a `text` prop via dynamicKey', () => {
    render(<Text text={dynamicKey('status_broken')} />);
    expect(screen.getByText('Broken')).toBeInTheDocument();
  });
});
