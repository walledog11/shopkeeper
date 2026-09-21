import { BadRequestError } from '@/lib/api/errors';

const MIN_SEARCH_QUERY_LENGTH = 2;

export function parseSearchQuery(searchParams: URLSearchParams): string {
  const q = searchParams.get('q')?.trim() ?? '';

  if (q.length < MIN_SEARCH_QUERY_LENGTH) {
    throw new BadRequestError(`Query must be at least ${MIN_SEARCH_QUERY_LENGTH} characters`);
  }

  return q;
}
