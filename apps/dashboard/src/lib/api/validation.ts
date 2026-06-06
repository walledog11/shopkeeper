import { BadRequestError } from '@/lib/api/errors';

export function assertKnownFields(body: Record<string, unknown>, allowedFields: Iterable<string>, message = 'Invalid request body') {
  const allowed = new Set(allowedFields);
  const unknownField = Object.keys(body).find(field => !allowed.has(field));
  if (!unknownField) return;

  throw new BadRequestError(message, [{
    code: 'unknown_field',
    field: unknownField,
    message: 'Unknown field',
  }]);
}

export function requireNonEmptyString(value: unknown, field: string, message = `${field} is required`): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(message);
  }
  return value.trim();
}

export function optionalNonEmptyString(value: unknown, field: string, message = `${field} must be a non-empty string`): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(message);
  }
  return value.trim();
}

export function optionalString(value: unknown, field: string, message = `${field} must be a string`): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestError(message);
  }
  return value;
}

export function optionalBoolean(value: unknown, field: string, message = `${field} must be a boolean`): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new BadRequestError(message);
  }
  return value;
}

export function normalizeStringArray(value: unknown, field: string, defaultValue: string[] | undefined = []): string[] | undefined {
  if (value === undefined) return defaultValue;
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an array`);
  }
  return value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}
