import { describe, expect, it } from 'vitest';

import { withoutKey } from './records';

describe('withoutKey', () => {
  it('drops the key it was given', () => {
    expect(withoutKey({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 });
  });

  it('leaves the original untouched', () => {
    const original = { a: 1, b: 2 };
    withoutKey(original, 'a');

    expect(original).toEqual({ a: 1, b: 2 });
  });

  it('returns the same object when the key is absent, so a state setter can bail', () => {
    const original = { a: 1 };

    expect(withoutKey(original, 'missing')).toBe(original);
  });

  it('drops a key holding a falsy value', () => {
    expect(withoutKey({ a: 0, b: 1 }, 'a')).toEqual({ b: 1 });
  });
});
