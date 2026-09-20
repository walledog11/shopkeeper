import { isRecord } from './guards.js';

/** Trimmed non-empty string, or null. */
export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** First usable string (or finite number as string) among `keys` on `value`. */
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
