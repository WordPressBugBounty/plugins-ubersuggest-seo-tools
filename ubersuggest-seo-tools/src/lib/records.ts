/**
 * A copy of `record` without one key, leaving the original untouched — or the
 * same object when the key is absent, so a state setter can bail on a no-op.
 */
export function withoutKey<Value>(
  record: Record<string, Value>,
  key: string,
): Record<string, Value> {
  if (!(key in record)) return record;
  const { [key]: _dropped, ...rest } = record;
  return rest;
}
