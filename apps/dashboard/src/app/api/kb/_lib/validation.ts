import { requireJsonObject } from '@/lib/api/body';
import {
  normalizeStringArray,
  optionalNonEmptyString,
} from '@/lib/api/validation';

export function parseUpdateKbArticleBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    title: optionalNonEmptyString(candidate.title, 'title'),
    body: optionalNonEmptyString(candidate.body, 'body'),
    tags: normalizeStringArray(candidate.tags, 'tags', undefined),
  };
}
