import { requireJsonObject } from '@/lib/api/body';
import { requireNonEmptyString } from '@/lib/api/validation';

export function parseAiSummaryBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  return {
    threadId: requireNonEmptyString(candidate.threadId, 'threadId', 'Missing threadId'),
  };
}
