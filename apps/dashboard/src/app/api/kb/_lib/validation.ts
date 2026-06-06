import { requireJsonObject } from '@/lib/api/body';
import {
  normalizeStringArray,
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/lib/api/validation';

export function parseCreateKnowledgeBaseBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    name: requireNonEmptyString(candidate.name, 'name'),
  };
}

export function parseCreateKbArticleBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    title: requireNonEmptyString(candidate.title, 'title', 'title and body are required'),
    body: requireNonEmptyString(candidate.body, 'body', 'title and body are required'),
    tags: normalizeStringArray(candidate.tags, 'tags') ?? [],
  };
}

export function parseUpdateKbArticleBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    title: optionalNonEmptyString(candidate.title, 'title'),
    body: optionalNonEmptyString(candidate.body, 'body'),
    tags: normalizeStringArray(candidate.tags, 'tags', undefined),
  };
}
