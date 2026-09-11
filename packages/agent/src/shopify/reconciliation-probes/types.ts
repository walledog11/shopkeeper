export type ShopifyReconciliationProbeResult =
  | { outcome: "committed"; message: string; spentShopCents?: number | null }
  | { outcome: "no_effect"; message: string }
  | { outcome: "still_unknown"; message: string };

export type ReconciliationProbe = (
  input: unknown,
  ctx: import("../client.js").ShopifyContext,
) => Promise<ShopifyReconciliationProbeResult>;

export function stillUnknown(message: string): ShopifyReconciliationProbeResult {
  return { outcome: "still_unknown", message };
}

export function committed(message: string, spentShopCents?: number | null): ShopifyReconciliationProbeResult {
  return { outcome: "committed", message, spentShopCents };
}

export function noEffect(message: string): ShopifyReconciliationProbeResult {
  return { outcome: "no_effect", message };
}
