import { shopifyIdempotencyKey, shopifyOperationTag } from "../client.js";

// Null, not a generated tag: without a stable operation identity there is
// nothing to search for, and a fresh random tag would match nothing and read as
// a confident no_effect.
export function operationTag(operationId?: string): string | null {
  if (!operationId) return null;
  return shopifyOperationTag(operationId);
}

export function giftCardCode(operationId?: string): string | null {
  if (!operationId) return null;
  return shopifyIdempotencyKey(operationId).replaceAll("-", "").slice(0, 20);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// REST returns an order's tags as one comma-separated string, unlike GraphQL,
// which returns a list. Comparing the raw string would match a tag that is
// merely a prefix of another.
export function restOrderTags(order: { tags?: unknown }): string[] {
  return String(order.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
