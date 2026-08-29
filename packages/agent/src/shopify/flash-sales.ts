import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolNotFound, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import { requireVariantGid, ShopifyInputError } from "./validation.js";
import { VARIANT_PRICES_QUERY } from "./exchanges.js";
import {
  assessValueAtRisk,
  formatValueAtRiskPreview,
  formatValueAtRiskRefusal,
  type ValueAtRiskVariant,
} from "../tools/value-at-risk.js";
import type { OrgSettings } from "../types.js";
import type { CreateFlashSaleInput, EndFlashSaleInput } from "../tools/registry/types.js";

/**
 * A flash sale is an automatic discount with an end date, never a price edit.
 *
 * The distinction is the whole safety property. An automatic discount is one
 * object with an expiry that Shopify enforces, and ending it is one deletion
 * that restores the original prices exactly. Editing prices to run a sale means
 * the original prices exist only in whatever recorded them, and "end the sale"
 * becomes a second bulk write that can half-fail. Everything here is built so
 * the merchant's way out is a single call.
 */

const TITLE_PREFIX = "Shopkeeper flash sale";

export const AUTOMATIC_DISCOUNT_CREATE_MUTATION = `mutation flashSaleCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
  discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
    automaticDiscountNode {
      id
      automaticDiscount {
        ... on DiscountAutomaticBasic {
          title
          startsAt
          endsAt
        }
      }
    }
    userErrors { field message }
  }
}`;

export const AUTOMATIC_DISCOUNT_DELETE_MUTATION = `mutation flashSaleEnd($id: ID!) {
  discountAutomaticDelete(id: $id) {
    deletedAutomaticDiscountId
    userErrors { field message }
  }
}`;

export const AUTOMATIC_DISCOUNTS_QUERY = `query flashSales($first: Int!) {
  discountNodes(first: $first, query: "type:automatic") {
    nodes {
      id
      discount {
        ... on DiscountAutomaticBasic {
          title
          status
          startsAt
          endsAt
        }
      }
    }
  }
}`;

interface AutomaticDiscountCreateData {
  discountAutomaticBasicCreate?: {
    automaticDiscountNode?: {
      id?: string | null;
      automaticDiscount?: { title?: string | null; endsAt?: string | null } | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface AutomaticDiscountDeleteData {
  discountAutomaticDelete?: {
    deletedAutomaticDiscountId?: string | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface AutomaticDiscountsData {
  discountNodes?: {
    nodes?: ({
      id?: string | null;
      discount?: {
        title?: string | null;
        status?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      } | null;
    } | null)[] | null;
  } | null;
}

interface VariantPriceNode {
  id?: string | null;
  title?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  product?: { title?: string | null } | null;
}

interface VariantPricesData {
  nodes?: (VariantPriceNode | null)[] | null;
}

export interface FlashSaleSummary {
  id: string;
  title: string;
  status: string | null;
  endsAt: string | null;
}

/**
 * The variants a sale names, titled from what Shopify says now rather than from
 * anything the model asserted, so the merchant reads the store's own names for
 * what is about to change.
 */
export async function loadVariantsAtRisk(
  ctx: ShopifyContext,
  variantIds: readonly string[],
): Promise<ValueAtRiskVariant[]> {
  const data = await shopifyGraphql<VariantPricesData>(ctx, VARIANT_PRICES_QUERY, {
    ids: [...variantIds],
  });

  const found: ValueAtRiskVariant[] = [];
  for (const node of data.nodes ?? []) {
    if (!node?.id) continue;
    const productTitle = node.product?.title ?? "Product";
    const variantTitle = node.title && node.title !== "Default Title"
      ? `${productTitle} (${node.title})`
      : productTitle;
    found.push({
      variantId: node.id,
      title: variantTitle,
    });
  }
  return found;
}

function requirePercentage(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100) {
    throw new ShopifyInputError("discount_percentage must be a number between 1 and 100.");
  }
  return value;
}

function requireHours(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ShopifyInputError("duration_hours must be a positive whole number of hours.");
  }
  return value;
}

function requireVariantIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ShopifyInputError("variant_ids must list the variants the sale applies to.");
  }
  return value.map((id) => requireVariantGid(id, "variant_ids"));
}

export async function createFlashSale(
  input: CreateFlashSaleInput,
  ctx: ShopifyContext,
  settings: OrgSettings,
  now: Date = new Date(),
): Promise<ToolResult> {
  let mutationStarted = false;
  try {
    const percentage = requirePercentage(input.discount_percentage);
    const hours = requireHours(input.duration_hours);
    const variantIds = requireVariantIds(input.variant_ids);
    const name = typeof input.name === "string" ? input.name.trim() : "";

    const variants = await loadVariantsAtRisk(ctx, variantIds);
    if (variants.length === 0) {
      return toolNotFound("None of those variant IDs exist in this store.");
    }
    if (variants.length !== variantIds.length) {
      const found = new Set(variants.map((variant) => variant.variantId));
      const missing = variantIds.filter((id) => !found.has(id));
      return toolError(
        `Error: ${missing.length} of those variant IDs do not exist in this store, so nothing was `
        + `applied: ${missing.join(", ")}.`,
      );
    }

    // The guard runs before the mutation, on Shopify's own numbers.
    const assessment = assessValueAtRisk(
      { variants, discountPercent: percentage, ttlHours: hours },
      settings,
      now,
    );
    if (!assessment.ok) return toolError(formatValueAtRiskRefusal(assessment));

    const endsAt = assessment.preview.expiresAt;
    const title = `${TITLE_PREFIX}: ${name || `${percentage}% off`}`;
    mutationStarted = true;
    const data = await shopifyGraphql<AutomaticDiscountCreateData>(
      ctx,
      AUTOMATIC_DISCOUNT_CREATE_MUTATION,
      {
        automaticBasicDiscount: {
          title,
          startsAt: now.toISOString(),
          // Never optional. Shopify enforces the expiry, so the sale ends even
          // if nothing of ours ever runs again.
          endsAt: endsAt?.toISOString(),
          minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: "1" } },
          customerGets: {
            items: { products: { productVariantsToAdd: variants.map((v) => v.variantId) } },
            value: { percentage: percentage / 100 },
          },
        },
      },
    );

    const payload = data.discountAutomaticBasicCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) return toolError(`Error: could not start the sale - ${userErrors}`);
    const id = payload?.automaticDiscountNode?.id;
    if (!id) {
      return toolError("Error: could not start the sale - Shopify did not return a discount.");
    }

    return toolOk(
      [
        `Started "${title}".`,
        formatValueAtRiskPreview(assessment.preview),
        `End it early with end_flash_sale and this ID: ${id}`,
      ].join("\n"),
      { flashSaleId: id, preview: assessment.preview },
    );
  } catch (err) {
    if (err instanceof ShopifyInputError) return toolError(`Error: ${err.message}`);
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return toolUnknown(
        `Unknown: the sale may have started at Shopify but could not be confirmed. `
        + `Check the store's automatic discounts before starting another — a second one would `
        + `stack a further markdown on the same variants. `
        + formatShopifyToolError("flash sale reconciliation failed", err),
      );
    }
    return toolError(formatShopifyToolError("failed to start the sale", err));
  }
}

export function readFlashSales(data: AutomaticDiscountsData): FlashSaleSummary[] {
  const sales: FlashSaleSummary[] = [];
  for (const node of data.discountNodes?.nodes ?? []) {
    if (!node?.id || !node.discount?.title) continue;
    sales.push({
      id: node.id,
      title: node.discount.title,
      status: node.discount.status ?? null,
      endsAt: node.discount.endsAt ?? null,
    });
  }
  return sales;
}

export async function listFlashSales(
  ctx: ShopifyContext,
  first = 25,
): Promise<FlashSaleSummary[]> {
  const data = await shopifyGraphql<AutomaticDiscountsData>(ctx, AUTOMATIC_DISCOUNTS_QUERY, {
    first,
  });
  return readFlashSales(data);
}

/**
 * End a sale. One call, and it is the whole way out: deleting the discount
 * restores every original price at once, because no price was ever changed.
 */
export async function endFlashSale(
  input: EndFlashSaleInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  let mutationStarted = false;
  try {
    const id = typeof input.flash_sale_id === "string" ? input.flash_sale_id.trim() : "";
    if (!id) {
      const running = await listFlashSales(ctx);
      if (running.length === 0) return toolOk("No automatic discounts are running.");
      const lines = running.map((sale) => (
        `- ${sale.title} (${sale.id})${sale.endsAt ? ` ends ${sale.endsAt}` : ""}`
      ));
      return toolOk(
        ["Running automatic discounts — call end_flash_sale with one of these IDs:", ...lines]
          .join("\n"),
        { sales: running },
      );
    }

    mutationStarted = true;
    const data = await shopifyGraphql<AutomaticDiscountDeleteData>(
      ctx,
      AUTOMATIC_DISCOUNT_DELETE_MUTATION,
      { id },
    );
    const payload = data.discountAutomaticDelete;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) return toolError(`Error: could not end the sale - ${userErrors}`);
    if (!payload?.deletedAutomaticDiscountId) {
      return toolNotFound(`No automatic discount with ID ${id} is running.`);
    }

    return toolOk(
      `Ended the sale. Prices are back to normal — nothing was repriced, so nothing needs undoing.`,
      { endedFlashSaleId: payload.deletedAutomaticDiscountId },
    );
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      // Ending is the safe direction — the risk of a lost confirmation here is a
      // sale the merchant believes is over and is in fact still discounting.
      return toolUnknown(
        `Unknown: the sale may have ended at Shopify but could not be confirmed. `
        + `Check the store's automatic discounts — it may still be running. `
        + formatShopifyToolError("end-sale reconciliation failed", err),
      );
    }
    return toolError(formatShopifyToolError("failed to end the sale", err));
  }
}
