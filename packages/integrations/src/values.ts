import { isRecord } from '@shopkeeper/agent/guards';

/**
 * Reading a string out of a provider's JSON.
 *
 * There were five of these in this package under one name and three
 * behaviours. All three agreed on when to return null — the trimmed value is
 * empty — and disagreed on what they returned: two handed back the original
 * string with its whitespace still on it, one handed back the trimmed one. A
 * padded id reads fine in a log and fails an equality check.
 *
 * Trimmed is the answer. No caller wanted the padding.
 */
export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The first of `keys` on `value` that holds a usable string, with a finite
 * number accepted as one. Providers spell the same field several ways across
 * API versions, which is what the key list is for.
 */
export function readStringKey(value: unknown, ...keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const next = value[key];
    const text = readString(next);
    if (text) return text;
    if (typeof next === 'number' && Number.isFinite(next)) return String(next);
  }
  return null;
}
