import { isRecord, readString } from '@shopkeeper/shared/guards';

export { readString };

/** A provider response's JSON body, or null when there is none or it does not parse. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
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
