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

