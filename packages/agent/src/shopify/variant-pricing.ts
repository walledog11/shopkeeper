import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import {
  toolError,
  toolNotFound,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type ReceiptV1,
  type ToolResult,
  type VariantPriceReceiptBatchV1,
  type VariantPriceReceiptFactsV1,
} from "../tools/result.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import {
  centsToMoney,
  moneyToCents,
  requireVariantGid,
  ShopifyInputError,
} from "./validation.js";
import type { SetVariantPricesInput } from "../tools/registry/types.js";

/**
 * Direct repricing, for the cases a discount cannot express — a permanent price
 * correction rather than a sale.
 *
 * Two properties make this safe to have at all. Every variant is named
 * individually: there is no query, no collection, no "all products", so a bulk
 * wildcard reprice is not something the schema can express. And every original
 * price is read before the write and returned with the result, so the audit
 * record carries what the price was, not only what it became.
 *
 * Nothing here bounds the depth of the change. A merchant setting a price knows
 * what it is worth, and the guard that used to second-guess that also blocked
 * the undo of its own permitted write.
 */

export const VARIANT_PRICE_UPDATE_MUTATION = `mutation variantPriceUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price }
    userErrors { field message }
  }
}`;

export const VARIANT_PRODUCT_QUERY = `query variantProducts($ids: [ID!]!) {
  shop { currencyCode }
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      price
      product { id }
    }
  }
}`;

interface VariantProductNode {
  id?: string | null;
  price?: string | null;
  product?: { id?: string | null } | null;
}

interface VariantProductsData {
  shop?: { currencyCode?: string | null } | null;
  nodes?: (VariantProductNode | null)[] | null;
}

interface VariantBulkUpdateData {
  productVariantsBulkUpdate?: {
    productVariants?: { id?: string | null; price?: string | null }[] | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

export interface RecordedPriceChange {
  variantId: string;
  originalPriceCents: number;
  newPriceCents: number;
}

interface PreparedPriceChange extends RecordedPriceChange {
  productId: string;
}

interface PriceBatch {
  productId: string;
  changes: PreparedPriceChange[];
}

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function target(ctx: ShopifyContext) {
  return { kind: "shop", id: ctx.shop } as const;
}

function receiptBatch(
  batch: PriceBatch,
  outcome: VariantPriceReceiptBatchV1["outcome"],
  confirmation: VariantPriceReceiptBatchV1["confirmation"],
  observed: ReadonlyMap<string, string | null> = new Map(),
): VariantPriceReceiptBatchV1 {
  return {
    productId: batch.productId,
    outcome,
    confirmation,
    changes: batch.changes.map((change) => ({
      productId: change.productId,
      variantId: change.variantId,
      originalPrice: centsToPrice(change.originalPriceCents),
      requestedPrice: centsToPrice(change.newPriceCents),
      observedPrice: observed.get(change.variantId) ?? null,
    })),
  };
}

function receiptFacts(
  currency: string | null,
  batches: VariantPriceReceiptBatchV1[],
): VariantPriceReceiptFactsV1 {
  return { currency, batches };
}

function legacyPriceChanges(changes: readonly RecordedPriceChange[]) {
  return changes.map((change) => ({
    variantId: change.variantId,
    originalPriceCents: change.originalPriceCents,
    newPriceCents: change.newPriceCents,
  }));
}

function withPriceReceipt(
  result: ToolResult,
  ctx: ShopifyContext,
  outcome: "succeeded" | "unknown",
  facts: VariantPriceReceiptFactsV1,
  code?: string,
): ToolResult {
  const envelope = shopifyReceiptEnvelope(ctx, target(ctx));
  if (!envelope) return result;
  const receipt: ReceiptV1 = outcome === "succeeded"
    ? {
        ...envelope,
        tool: "set_variant_prices",
        outcome,
        providerReference: ctx.shop,
        facts,
      }
    : {
        ...envelope,
        tool: "set_variant_prices",
        outcome,
        code: code ?? "partial_variant_price_outcome",
        providerReference: ctx.shop,
        facts,
      };
  return { ...result, receipt };
}

function priceFailure(
  result: ToolResult,
  ctx: ShopifyContext,
  outcome: "not_found" | "rejected" | "failed" | "unknown",
  code: string,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    target(ctx),
    "set_variant_prices",
    outcome,
    code,
    outcome === "unknown" ? ctx.shop : null,
  );
  return receipt ? { ...result, receipt } : result;
}

function requirePriceEntries(value: unknown): { variantId: string; priceCents: number }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ShopifyInputError("prices must name at least one variant and its new price.");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new ShopifyInputError("each price entry must be an object.");
    }
    const record = entry as Record<string, unknown>;
    const variantId = requireVariantGid(record.variant_id, "variant_id");
    const price = typeof record.price === "number"
      ? record.price
      : Number.parseFloat(String(record.price ?? ""));
    if (!Number.isFinite(price) || price < 0) {
      throw new ShopifyInputError(`price for ${variantId} must be a non-negative number.`);
    }
    return { variantId, priceCents: Math.round(price * 100) };
  });
}

export async function setVariantPrices(
  input: SetVariantPricesInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  try {
    const entries = requirePriceEntries(input.prices);
    const variantIds = entries.map((entry) => entry.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new ShopifyInputError("prices names the same variant more than once.");
    }

    const data = await shopifyGraphql<VariantProductsData>(ctx, VARIANT_PRODUCT_QUERY, {
      ids: variantIds,
    });
    const current = new Map<string, { priceCents: number; productId: string }>();
    for (const node of data.nodes ?? []) {
      if (!node?.id || !node.product?.id) continue;
      current.set(node.id, { priceCents: moneyToCents(node.price), productId: node.product.id });
    }

    const missing = variantIds.filter((id) => !current.has(id));
    if (missing.length > 0) {
      return priceFailure(toolNotFound(
        `Error: ${missing.length} of those variant IDs do not exist in this store, so no price was `
        + `changed: ${missing.join(", ")}.`,
      ), ctx, "not_found", "variant_not_found");
    }

    const changes = entries.map((entry) => ({
      productId: current.get(entry.variantId)!.productId,
      variantId: entry.variantId,
      originalPriceCents: current.get(entry.variantId)!.priceCents,
      newPriceCents: entry.priceCents,
    }));
    const currency = data.shop?.currencyCode?.trim().toUpperCase() || null;

    // Shopify's bulk update is per product, so one call per product.
    const byProduct = new Map<string, PreparedPriceChange[]>();
    for (const change of changes) {
      const list = byProduct.get(change.productId) ?? [];
      list.push(change);
      byProduct.set(change.productId, list);
    }
    const batches: PriceBatch[] = [...byProduct].map(([productId, batchChanges]) => ({
      productId,
      changes: batchChanges,
    }));
    const outcomes: VariantPriceReceiptBatchV1[] = [];

    for (const [batchIndex, batch] of batches.entries()) {
      let result: VariantBulkUpdateData;
      try {
        result = await shopifyGraphql<VariantBulkUpdateData>(ctx, VARIANT_PRICE_UPDATE_MUTATION, {
          productId: batch.productId,
          variants: batch.changes.map((change) => ({
            id: change.variantId,
            price: centsToPrice(change.newPriceCents),
          })),
        });
      } catch (err) {
        if (isAmbiguousShopifyMutationError(err)) {
          return reconcileVariantPrices(ctx, currency, batches, outcomes, err);
        }
        const unresolved = [
          ...outcomes,
          receiptBatch(batch, "failed", "provider_rejected"),
          ...batches.slice(batchIndex + 1).map((future) => (
            receiptBatch(future, "failed", "not_attempted")
          )),
        ];
        if (outcomes.length > 0) {
          return withPriceReceipt(
            toolUnknown(
              `Unknown: repricing stopped after ${outcomes.length} product batch(es) committed. `
              + formatShopifyToolError("a later product batch failed", err),
            ),
            ctx,
            "unknown",
            receiptFacts(currency, unresolved),
            "partial_variant_price_failure",
          );
        }
        return priceFailure(
          toolError(formatShopifyToolError("failed to reprice", err)),
          ctx,
          "failed",
          "definite_variant_price_failure",
        );
      }
      const payload = result.productVariantsBulkUpdate;
      const userErrors = formatUserErrors(payload?.userErrors);
      if (userErrors) {
        const unresolved = [
          ...outcomes,
          receiptBatch(batch, "failed", "provider_rejected"),
          ...batches.slice(batchIndex + 1).map((future) => (
            receiptBatch(future, "failed", "not_attempted")
          )),
        ];
        const resultText = toolPolicyBlock(
          `Error: repricing stopped partway - ${userErrors}. `
          + `Applied so far: ${outcomes.length ? outcomes.flatMap((entry) => entry.changes.map((change) => change.variantId)).join(", ") : "none"}. `
          + `Original prices: ${formatOriginalPrices(changes)}`,
        );
        if (outcomes.length === 0) {
          return priceFailure(resultText, ctx, "rejected", "provider_rejected_variant_prices");
        }
        return withPriceReceipt(
          toolUnknown(resultText.message),
          ctx,
          "unknown",
          receiptFacts(currency, unresolved),
          "partial_variant_price_rejection",
        );
      }
      const returned = new Map(
        (payload?.productVariants ?? [])
          .filter((variant): variant is { id: string; price?: string | null } => Boolean(variant?.id))
          .map((variant) => [variant.id, variant.price ?? null]),
      );
      const confirmed = batch.changes.every((change) => (
        returned.get(change.variantId) === centsToPrice(change.newPriceCents)
      ));
      if (!confirmed) {
        return reconcileVariantPrices(
          ctx,
          currency,
          batches,
          outcomes,
          new Error("Shopify returned an incomplete or mismatched repricing result."),
        );
      }
      outcomes.push(receiptBatch(batch, "succeeded", "mutation_response", returned));
    }

    return withPriceReceipt(toolOk(
      [
        `Repriced ${changes.length} variant(s).`,
        `Original prices, for the record: ${formatOriginalPrices(changes)}`,
      ].join("\n"),
      {
        priceChanges: legacyPriceChanges(changes),
      },
    ), ctx, "succeeded", receiptFacts(currency, outcomes));
  } catch (err) {
    if (err instanceof ShopifyInputError) {
      return priceFailure(
        toolPolicyBlock(`Error: ${err.message}`),
        ctx,
        "rejected",
        "invalid_variant_price_input",
      );
    }
    return priceFailure(
      toolError(formatShopifyToolError("failed to read variant prices", err)),
      ctx,
      "failed",
      "variant_price_read_failed",
    );
  }
}

async function reconcileVariantPrices(
  ctx: ShopifyContext,
  currency: string | null,
  batches: PriceBatch[],
  confirmed: VariantPriceReceiptBatchV1[],
  cause: unknown,
): Promise<ToolResult> {
  const confirmedProducts = new Set(confirmed.map((batch) => batch.productId));
  try {
    const data = await shopifyGraphql<VariantProductsData>(ctx, VARIANT_PRODUCT_QUERY, {
      ids: batches.flatMap((batch) => batch.changes.map((change) => change.variantId)),
    });
    const observed = new Map<string, string | null>();
    for (const node of data.nodes ?? []) {
      if (node?.id) observed.set(node.id, node.price ?? null);
    }
    const outcomes = batches.map((batch) => {
      const prices = batch.changes.map((change) => observed.get(change.variantId) ?? null);
      const allRequested = batch.changes.every((change, index) => (
        prices[index] === centsToPrice(change.newPriceCents)
      ));
      const allOriginal = batch.changes.every((change, index) => (
        prices[index] === centsToPrice(change.originalPriceCents)
      ));
      const outcome = allRequested ? "succeeded" : allOriginal ? "failed" : "unknown";
      return receiptBatch(batch, outcome, "read_after_ambiguous_response", observed);
    });
    const facts = receiptFacts(data.shop?.currencyCode?.trim().toUpperCase() || currency, outcomes);
    if (outcomes.every((batch) => batch.outcome === "succeeded")) {
      const changes = batches.flatMap((batch) => batch.changes);
      return withPriceReceipt(
        toolOk(
          [
            `Repricing was confirmed by reading all ${changes.length} variant price(s) after Shopify's response was interrupted.`,
            `Original prices, for the record: ${formatOriginalPrices(changes)}`,
          ].join("\n"),
          { priceChanges: legacyPriceChanges(changes) },
        ),
        ctx,
        "succeeded",
        facts,
      );
    }
    return withPriceReceipt(
      toolUnknown(
        `Unknown: repricing produced a partial or unconfirmed result. Check the recorded per-variant prices before changing them again. `
        + `Original prices: ${formatOriginalPrices(batches.flatMap((batch) => batch.changes))}. `
        + formatShopifyToolError("reprice confirmation was incomplete", cause),
      ),
      ctx,
      "unknown",
      facts,
      "partial_or_unconfirmed_variant_prices",
    );
  } catch (reconciliationError) {
    const outcomes = [
      ...confirmed,
      ...batches
        .filter((batch) => !confirmedProducts.has(batch.productId))
        .map((batch, index) => receiptBatch(
          batch,
          index === 0 ? "unknown" : "failed",
          index === 0 ? "read_after_ambiguous_response" : "not_attempted",
        )),
    ];
    return withPriceReceipt(
      toolUnknown(
        `Unknown: repricing may have committed at Shopify but could not be confirmed. `
        + `Check the store's prices before repricing again. `
        + `Original prices: ${formatOriginalPrices(batches.flatMap((batch) => batch.changes))}. `
        + formatShopifyToolError("reprice reconciliation failed", reconciliationError),
      ),
      ctx,
      "unknown",
      receiptFacts(currency, outcomes),
      "variant_price_reconciliation_failed",
    );
  }
}

export function formatOriginalPrices(changes: readonly RecordedPriceChange[]): string {
  return changes
    .map((change) => (
      `${change.variantId} $${centsToMoney(change.originalPriceCents)} -> `
      + `$${centsToMoney(change.newPriceCents)}`
    ))
    .join("; ");
}
