import { requireJsonObject } from '@/lib/api/body';
import {
  normalizeStringArray,
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/lib/api/validation';

export function parseCreateCannedResponseBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    title: requireNonEmptyString(candidate.title, 'title'),
    body: requireNonEmptyString(candidate.body, 'body'),
    tags: normalizeStringArray(candidate.tags, 'tags') ?? [],
    channels: normalizeStringArray(candidate.channels, 'channels') ?? [],
  };
}

export function parseUpdateCannedResponseBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    title: optionalNonEmptyString(candidate.title, 'title'),
    body: optionalNonEmptyString(candidate.body, 'body'),
    tags: normalizeStringArray(candidate.tags, 'tags', undefined),
    channels: normalizeStringArray(candidate.channels, 'channels', undefined),
  };
}
