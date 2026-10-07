import { unstable_cache } from 'next/cache';
import { getHomeSummary } from './home-summary';

// Coalesce both cold-cache loads and background revalidations, including the
// Shopify read. A cache hit can return before revalidation has finished.
const pending = new Map<string, ReturnType<typeof getHomeSummary>>();

function loadCoalescedSummary(
  organizationId: string,
  settings: Parameters<typeof getHomeSummary>[1],
): ReturnType<typeof getHomeSummary> {
  const key = JSON.stringify([organizationId, settings]);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = getHomeSummary(organizationId, settings).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

// Tenant and settings are explicit arguments resolved by authenticated callers.
export const getCachedHomeSummary = unstable_cache(
  loadCoalescedSummary, ['home-summary-v1'], { revalidate: 15 },
);
