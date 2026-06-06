import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';

export function parseCustomerMemoryPatchBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  if (candidate.summary === undefined && candidate.keyFacts === undefined) {
    throw new BadRequestError('Missing summary or keyFacts');
  }
  return candidate;
}

export function normalizeMemorySummary(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new BadRequestError('summary must be a string');
  }
  return value.trim();
}

export function normalizeMemoryKeyFacts(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    throw new BadRequestError('keyFacts must be an array');
  }
  return value.flatMap((item) => {
    if (typeof item !== 'string') {
      throw new BadRequestError('keyFacts must contain only strings');
    }
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}
