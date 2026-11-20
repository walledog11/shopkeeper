export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A UUID's shape: 8-4-4-4-12 hex digits, any version, as a Postgres `uuid`
 * column accepts it. Checked before an ID reaches a query or a key.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * A string read out of an unknown value (provider JSON, stored settings, a
 * request body): trimmed, or null when nothing is left. Copies of this once
 * disagreed on whether to keep the whitespace; a padded id reads fine in a log
 * and fails an equality check, so trimmed is the answer everywhere.
 */
export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `value` itself when it is a plain object, else null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
