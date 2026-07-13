import type { CreateGiftCardInput, SpendToolResult } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  shopifyIdempotencyKey,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, toolUnknown } from "../tools/result.js";
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
    giftCard?: {
      id?: string | null;
      expiresOn?: string | null;
      note?: string | null;
      initialValue?: { amount?: string | null } | null;
      customer?: { id?: string | null } | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

function spendError(message: string): SpendToolResult {
  return { ...toolError(message), spentCents: null };
}

function spendUnknown(message: string): SpendToolResult {
  return { ...toolUnknown(message), spentCents: null };
}

function operationCode(operationId?: string): string {
  return shopifyIdempotencyKey(operationId).replaceAll("-", "").slice(0, 20);
}

function normalizeCode(value: string): string {
  return value.replaceAll(/\s+/g, "").toLowerCase();
}

export async function createGiftCard(
  input: CreateGiftCardInput,
  ctx: ShopifyContext
): Promise<SpendToolResult> {
  let mutationStarted = false;
  let requestedCode: string | null = null;
  try {
    const amount = requireAmount(input.amount, "amount");
    const customerId = optionalString(input.customer_id);
    const reason = optionalString(input.reason);
    const expiresInDays = requireExpiryDays(input.expires_in_days);

    const code = operationCode(ctx.operationId);
    requestedCode = code;
    const operationNote = [reason ? `Goodwill: ${reason}` : null, `Shopkeeper operation: ${code}`]
      .filter(Boolean)
      .join("\n");
    const giftCardInput: Record<string, unknown> = { initialValue: amount, code, note: operationNote };
    let customerGid: string | null = null;
    if (customerId) {
      customerGid = `gid://shopify/Customer/${requireNumericId(customerId, "customer_id")}`;
      giftCardInput.customerId = customerGid;
      // Shopify emails the gift card (with its code) to the recipient. This is the
      // only delivery path that works when the reply was planned before the code
      // existed - approved plans execute their send_reply text verbatim.
      giftCardInput.recipientAttributes = { id: customerGid };
    }
    let expiresOn: string | null = null;
    if (expiresInDays !== undefined) {
      expiresOn = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      giftCardInput.expiresOn = expiresOn;
    }

    mutationStarted = true;
    const data = await shopifyGraphql<GiftCardCreateData>(
      ctx,
      `mutation giftCardCreate($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCardCode
          giftCard {
            id
            expiresOn
            note
            initialValue { amount }
            customer { id }
          }
          userErrors { field message code }
        }
      }`,
      { input: giftCardInput }
    );

    const payload = data.giftCardCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) {
      if (payload?.userErrors?.some((error) => error.code === "TAKEN")) {
        return spendUnknown(
          `Unknown: Shopify reports that the stable code for this gift-card operation is already in use. The same operation may already have committed. Do not create another gift card or confirm it to the customer until code ${code} is reconciled.`,
        );
      }
      return spendError(`Error: could not create gift card - ${userErrors}`);
    }

    const returnedCode = payload?.giftCardCode;
    const giftCard = payload?.giftCard;
    if (
      !returnedCode
      || normalizeCode(returnedCode) !== normalizeCode(code)
      || !giftCard?.id
      || giftCard.note !== operationNote
      || moneyToCents(giftCard.initialValue?.amount ?? "0") !== moneyToCents(amount)
      || (giftCard.customer?.id ?? null) !== customerGid
      || (giftCard.expiresOn ?? null) !== expiresOn
    ) {
      return spendUnknown(
        `Unknown: Shopify returned an incomplete or mismatched gift card for the requested $${amount}. Do not create another gift card or confirm a code to the customer until code ${code} is reconciled.`,
      );
    }

    const expiryNote = expiresInDays !== undefined ? ` It expires in ${expiresInDays} day(s).` : "";
    const deliveryNote = customerId
      ? " Shopify is emailing the code to the customer; include it in your reply too when you can."
      : " This code is only shown once - you MUST tell the customer the code in your reply so they can redeem it at checkout.";
    return {
      ...toolOk(`Created a $${amount} gift card with code ${returnedCode}.${expiryNote}${deliveryNote}`),
      spentCents: moneyToCents(amount),
    };
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return spendUnknown(
        `Unknown: the gift-card request may have committed at Shopify, but its final state could not be confirmed. Do not create another gift card or confirm it to the customer until code ${requestedCode ?? "for this operation"} is reconciled. ${formatShopifyToolError("gift card reconciliation failed", err)}`,
      );
    }
    return spendError(formatShopifyToolError("failed to create gift card", err));
  }
}
