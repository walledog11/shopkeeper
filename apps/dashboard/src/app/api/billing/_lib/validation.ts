import { requireJsonObject } from '@/lib/api/body';
import { requireNonEmptyString } from '@/lib/api/validation';

export function parseCheckoutBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  return {
    tier: requireNonEmptyString(candidate.tier, 'tier'),
  };
}
