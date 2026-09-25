import { describe, expect, it } from 'vitest';

import { partitionIssues } from './partition-issues';
import type { Issue } from './types';

const issue = (id: string, over: Partial<Issue['fix']> = {}): Issue => ({
  id,
  label: id,
  count: 1,
  level: 'errors',
  seoImpact: 'high',
  difficulty: 'easy',
  fix: { state: 'fixable', message: '', previewable: true, ...over },
});

describe('partitionIssues', () => {
  it('splits open and resolved issues across the tabs', () => {
    const open = issue('a');
    const applied = issue('b', { applied: true });
    const cleared = issue('c', { state: 'ok' });
    const { toFix, fixed } = partitionIssues(
      [open, applied, cleared],
      [],
      null,
    );
    expect(toFix).toEqual([open]);
    expect(fixed).toEqual([applied, cleared]);
  });

  it('keeps an exiting row in To fix while its fade plays', () => {
    const applied = issue('a', { applied: true });
    const { toFix, fixed } = partitionIssues([applied], ['a'], null);
    expect(toFix).toEqual([applied]);
    expect(fixed).toEqual([]);
  });

  it('holds a row fixed under an open drawer in To fix until it closes', () => {
    const applied = issue('a', { applied: true });
    const held = { id: 'a', wasUnresolved: true };
    const { toFix, fixed } = partitionIssues([applied], [], held);
    expect(toFix).toEqual([applied]);
    expect(fixed).toEqual([]);
  });

  it('leaves a Fixed-tab row in place when its drawer opens from there', () => {
    const applied = issue('a', { applied: true });
    const held = { id: 'a', wasUnresolved: false };
    const { toFix, fixed } = partitionIssues([applied], [], held);
    expect(toFix).toEqual([]);
    expect(fixed).toEqual([applied]);
  });
});
