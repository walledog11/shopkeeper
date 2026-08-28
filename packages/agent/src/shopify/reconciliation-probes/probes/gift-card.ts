import type { CreateGiftCardInput } from "../../../tools/index.js";
import { shopifyGraphql, type ShopifyContext } from "../../client.js";
import { moneyToCents, requireAmount } from "../../validation.js";
import { giftCardCode } from "../helpers.js";
import { GIFT_CARDS_BY_CODE_QUERY, RECENT_GIFT_CARDS_QUERY } from "../queries.js";
import { committed, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeGiftCard(
  input: CreateGiftCardInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const code = giftCardCode(ctx.operationId);
  if (!code) {
    return stillUnknown("Gift-card reconciliation requires a stable operation identity.");
  }
  const amount = requireAmount(input.amount, "amount");
  const data = await shopifyGraphql<{
    giftCards?: {
      nodes?: Array<{
        id?: string | null;
        initialValue?: { amount?: string | null } | null;
        note?: string | null;
      }>;
    } | null;
  }>(ctx, GIFT_CARDS_BY_CODE_QUERY, { query: `code:${code}` }, { maxRetries: 1 });
  const matches = (data.giftCards?.nodes ?? []).filter((card) => (
    card.id
    && moneyToCents(card.initialValue?.amount ?? "0") === moneyToCents(amount)
    && card.note?.includes(`Shopkeeper operation: ${code}`)
  ));
  if (matches.length === 1) {
    return committed(`Reconciled gift card with code ${code}.`, moneyToCents(amount));
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple gift cards match code ${code}.`);
  }

  // Shopify can return a conclusive giftCardCreate payload while its `code:`
  // search still returns no rows. Fall back to the recent-card list and match
  // both the operation note and last characters; neither field alone is a safe
  // identity. A miss remains unknown because search/list visibility cannot
  // prove that a successfully returned card was never created.
  const recent = await shopifyGraphql<{
    giftCards?: {
      nodes?: Array<{
        id?: string | null;
        initialValue?: { amount?: string | null } | null;
        note?: string | null;
        lastCharacters?: string | null;
      }>;
    } | null;
  }>(ctx, RECENT_GIFT_CARDS_QUERY, {}, { maxRetries: 1 });
  const recentMatches = (recent.giftCards?.nodes ?? []).filter((card) => (
    card.id
    && moneyToCents(card.initialValue?.amount ?? "0") === moneyToCents(amount)
    && card.note?.includes(`Shopkeeper operation: ${code}`)
    && card.lastCharacters?.toLowerCase() === code.slice(-4).toLowerCase()
  ));
  if (recentMatches.length === 1) {
    return committed(`Reconciled gift card with code ${code}.`, moneyToCents(amount));
  }
  if (recentMatches.length > 1) {
    return stillUnknown(`Multiple recent gift cards match code ${code}.`);
  }
  return stillUnknown(`No gift card with code ${code} was visible at Shopify; creation cannot be ruled out.`);
}
