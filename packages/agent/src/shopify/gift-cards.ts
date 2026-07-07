import type { CreateGiftCardInput, SpendToolResult } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk } from "../tools/result.js";
import { moneyToCents, optionalString, requireAmount, requireNumericId, ShopifyInputError } from "./validation.js";

function requireExpiryDays(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ShopifyInputError("expires_in_days must be a positive integer.");
  }
  return value;
}

interface GiftCardCreateData {
  giftCardCreate?: {
    giftCardCode?: string | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

function spendError(message: string): SpendToolResult {
  return { ...toolError(message), spentCents: null };
}

export async function createGiftCard(
  input: CreateGiftCardInput,
  ctx: ShopifyContext
): Promise<SpendToolResult> {
  try {
    const amount = requireAmount(input.amount, "amount");
    const customerId = optionalString(input.customer_id);
    const reason = optionalString(input.reason);
    const expiresInDays = requireExpiryDays(input.expires_in_days);

    const giftCardInput: Record<string, unknown> = { initialValue: amount };
    if (customerId) {
      const customerGid = `gid://shopify/Customer/${requireNumericId(customerId, "customer_id")}`;
      giftCardInput.customerId = customerGid;
      // Shopify emails the gift card (with its code) to the recipient. This is the
      // only delivery path that works when the reply was planned before the code
      // existed - approved plans execute their send_reply text verbatim.
      giftCardInput.recipientAttributes = { id: customerGid };
    }
    if (reason) giftCardInput.note = `Goodwill: ${reason}`;
    if (expiresInDays !== undefined) {
      giftCardInput.expiresOn = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    }

    const data = await shopifyGraphql<GiftCardCreateData>(
      ctx,
      `mutation giftCardCreate($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCardCode
          userErrors { field message }
        }
      }`,
      { input: giftCardInput }
    );

    const payload = data.giftCardCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) return spendError(`Error: could not create gift card - ${userErrors}`);

    const code = payload?.giftCardCode;
    if (!code) {
      return spendError("Error: could not create gift card - Shopify did not return a gift card code.");
    }

    const expiryNote = expiresInDays !== undefined ? ` It expires in ${expiresInDays} day(s).` : "";
    const deliveryNote = customerId
      ? " Shopify is emailing the code to the customer; include it in your reply too when you can."
      : " This code is only shown once - you MUST tell the customer the code in your reply so they can redeem it at checkout.";
    return {
      ...toolOk(`Created a $${amount} gift card with code ${code}.${expiryNote}${deliveryNote}`),
      spentCents: moneyToCents(amount),
    };
  } catch (err) {
    return spendError(formatShopifyToolError("failed to create gift card", err));
  }
}
