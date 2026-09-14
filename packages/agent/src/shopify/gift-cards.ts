import { createHash } from "node:crypto";
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
import {
  toolError,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type GiftCardReceiptFactsV1,
  type ReceiptV1,
} from "../tools/result.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
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
      initialValue?: { amount?: string | null; currencyCode?: string | null } | null;
      customer?: { id?: string | null } | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

export const GIFT_CARD_CREATE_MUTATION = `mutation giftCardCreate($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCardCode
          giftCard {
            id
            expiresOn
            note
            initialValue { amount currencyCode }
            customer { id }
          }
          userErrors { field message code }
        }
      }`;

export const GIFT_CARD_RECEIPT_LOOKUP_QUERY = `query ShopkeeperGiftCardReceipt($query: String!) {
  giftCards(first: 2, query: $query) {
    nodes {
      id
      expiresOn
      note
      initialValue { amount currencyCode }
      customer { id }
      lastCharacters
    }
  }
}`;

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

interface ExpectedGiftCard {
  amount: string;
  code: string;
  operationNote: string;
  customerId: string | null;
  customerGid: string | null;
  expiresOn: string | null;
  expiresInDays: number | undefined;
}

interface ObservedGiftCard {
  id?: string | null;
  expiresOn?: string | null;
  note?: string | null;
  initialValue?: { amount?: string | null; currencyCode?: string | null } | null;
  customer?: { id?: string | null } | null;
  lastCharacters?: string | null;
}

function giftCardMatches(card: ObservedGiftCard | null | undefined, expected: ExpectedGiftCard): boolean {
  return Boolean(
    card?.id
    && card.note === expected.operationNote
    && moneyToCents(card.initialValue?.amount ?? "0") === moneyToCents(expected.amount)
    && card.initialValue?.currencyCode
    && (card.customer?.id ?? null) === expected.customerGid
    && (card.expiresOn ?? null) === expected.expiresOn,
  );
}

function giftCardFailure(
  ctx: ShopifyContext,
  customerId: string | null,
  result: SpendToolResult,
  outcome: "rejected" | "failed" | "unknown",
  code: string,
  providerReference: string | null = null,
): SpendToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "customer", id: customerId ?? "unresolved" },
    "create_gift_card",
    outcome,
    code,
    providerReference,
  );
  return receipt ? { ...result, receipt } : result;
}

function confirmedGiftCardResult(
  ctx: ShopifyContext,
  card: ObservedGiftCard,
  returnedCode: string,
  expected: ExpectedGiftCard,
  reconciled: boolean,
): SpendToolResult {
  const currency = card.initialValue?.currencyCode?.trim().toUpperCase();
  const amount = card.initialValue?.amount?.trim();
  const giftCardId = card.id?.trim();
  const envelope = shopifyReceiptEnvelope(
    ctx,
    { kind: "customer", id: expected.customerId ?? "unresolved" },
  );
  if (!giftCardId || !currency || !amount || (envelope && !expected.customerId)) {
    return giftCardFailure(
      ctx,
      expected.customerId,
      spendUnknown(`Unknown: Shopify returned an incomplete gift card for the requested $${expected.amount}. Do not create another gift card or confirm a code until it is reconciled.`),
      "unknown",
      "incomplete_gift_card_receipt",
      giftCardId ?? null,
    );
  }
  const expiryNote = expected.expiresInDays !== undefined
    ? ` It expires in ${expected.expiresInDays} day(s).`
    : "";
  const confirmation = reconciled ? " (confirmed after an interrupted provider response)" : "";
  const deliveryNote = expected.customerId
    ? " Shopify is emailing the code to the customer; include it in your reply too when you can."
    : " This code is only shown once - you MUST tell the customer the code in your reply so they can redeem it at checkout.";
  const result: SpendToolResult = {
    ...toolOk(`Created a $${amount} ${currency} gift card${confirmation} with code ${returnedCode}.${expiryNote}${deliveryNote}`),
    spentCents: moneyToCents(amount),
  };
  if (!envelope) return result;
  const facts: GiftCardReceiptFactsV1 = {
    giftCardId,
    customerId: expected.customerId!,
    amount,
    currency,
    codeSha256: createHash("sha256").update(normalizeCode(returnedCode)).digest("hex"),
    lastCharacters: normalizeCode(returnedCode).slice(-4),
    expiresOn: expected.expiresOn,
    notificationRequested: true,
  };
  const receipt: ReceiptV1 = {
    ...envelope,
    tool: "create_gift_card",
    outcome: "succeeded",
    providerReference: giftCardId,
    facts,
  };
  return { ...result, receipt };
}

async function reconcileGiftCard(
  ctx: ShopifyContext,
  expected: ExpectedGiftCard,
  mutationError?: unknown,
): Promise<SpendToolResult> {
  try {
    const data = await shopifyGraphql<{ giftCards?: { nodes?: ObservedGiftCard[] | null } | null }>(
      ctx,
      GIFT_CARD_RECEIPT_LOOKUP_QUERY,
      { query: `code:${expected.code}` },
      { maxRetries: 1 },
    );
    const matches = (data.giftCards?.nodes ?? []).filter((card) => giftCardMatches(card, expected));
    if (matches.length === 1) {
      return confirmedGiftCardResult(ctx, matches[0]!, expected.code, expected, true);
    }
    const detail = mutationError
      ? ` ${formatShopifyToolError("gift card reconciliation failed", mutationError)}`
      : "";
    return giftCardFailure(
      ctx,
      expected.customerId,
      spendUnknown(`Unknown: the gift-card request may have committed at Shopify, but a follow-up lookup did not identify exactly one complete matching card. Do not create another gift card or confirm it until code ${expected.code} is reconciled.${detail}`),
      "unknown",
      matches.length > 1 ? "multiple_gift_card_matches" : "gift_card_not_confirmed",
    );
  } catch (error) {
    return giftCardFailure(
      ctx,
      expected.customerId,
      spendUnknown(`Unknown: the gift-card request may have committed at Shopify and its follow-up lookup failed. Do not create another gift card or confirm it until code ${expected.code} is reconciled. ${formatShopifyToolError("gift card reconciliation failed", error)}`),
      "unknown",
      "gift_card_reconciliation_failed",
    );
  }
}

export async function createGiftCard(
  input: CreateGiftCardInput,
  ctx: ShopifyContext
): Promise<SpendToolResult> {
  let mutationStarted = false;
  let expected: ExpectedGiftCard | null = null;
  try {
    const amount = requireAmount(input.amount, "amount");
    const customerId = optionalString(input.customer_id);
    const reason = optionalString(input.reason);
    const expiresInDays = requireExpiryDays(input.expires_in_days);

    const code = operationCode(ctx.operationId);
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
    expected = {
      amount,
      code,
      operationNote,
      customerId: customerId ?? null,
      customerGid,
      expiresOn,
      expiresInDays,
    };

    mutationStarted = true;
    const data = await shopifyGraphql<GiftCardCreateData>(
      ctx,
      GIFT_CARD_CREATE_MUTATION,
      { input: giftCardInput }
    );

    const payload = data.giftCardCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) {
      if (payload?.userErrors?.some((error) => error.code === "TAKEN")) {
        return reconcileGiftCard(ctx, expected);
      }
      return giftCardFailure(
        ctx,
        customerId ?? null,
        spendError(`Error: could not create gift card - ${userErrors}`),
        "failed",
        "provider_rejected_gift_card",
      );
    }

    const returnedCode = payload?.giftCardCode;
    const giftCard = payload?.giftCard;
    if (
      !returnedCode
      || !giftCard
      || normalizeCode(returnedCode) !== normalizeCode(code)
      || !giftCardMatches(giftCard, expected)
    ) {
      return reconcileGiftCard(ctx, expected);
    }
    return confirmedGiftCardResult(ctx, giftCard, returnedCode, expected, false);
  } catch (err) {
    if (mutationStarted && expected && isAmbiguousShopifyMutationError(err)) {
      return reconcileGiftCard(ctx, expected, err);
    }
    const customerId = expected?.customerId ?? optionalString(input.customer_id) ?? null;
    if (err instanceof ShopifyInputError) {
      return giftCardFailure(
        ctx,
        customerId,
        { ...toolPolicyBlock(formatShopifyToolError("failed to create gift card", err)), spentCents: null },
        "rejected",
        "invalid_gift_card_input",
      );
    }
    return giftCardFailure(
      ctx,
      customerId,
      spendError(formatShopifyToolError("failed to create gift card", err)),
      "failed",
      mutationStarted ? "provider_rejected_gift_card" : "pre_dispatch_failure",
    );
  }
}
