import { createHash } from "node:crypto";
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
  type EndFlashSaleReceiptFactsV1,
  type FlashSaleReceiptFactsV1,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";
import { requireVariantGid, ShopifyInputError } from "./validation.js";
import { VARIANT_PRICES_QUERY } from "./exchanges.js";
import type { CreateFlashSaleInput, EndFlashSaleInput, FlashSaleScope } from "../tools/registry/types.js";

/** One variant a sale names, titled from the store's own record. */
export interface SaleVariant {
  variantId: string;
  title?: string;
}

const SAMPLE_TITLE_LIMIT = 5;

/**
 * What the sale hit, rendered from fields. Length is controlled by choosing how
 * many titles to show, never by truncating the line. A catalog-wide sale has no
 * variant list to sample, so it says what it covers instead of counting.
 */
function describeSale(
  scope: FlashSaleScope,
  variants: readonly SaleVariant[],
  discountPercent: number,
  endsAt: Date,
): string[] {
  const lines = [
    scope === "entire_catalog"
      ? "Applies to: every product in the store"
      : `Variants: ${variants.length}`,
    `Discount: ${discountPercent}%`,
    `Ends: ${endsAt.toISOString()}`,
  ];
  if (scope === "variants") {
    const shown = variants.slice(0, SAMPLE_TITLE_LIMIT)
      .map((variant) => variant.title ?? variant.variantId);
    const more = variants.length - shown.length;
    lines.push(`Affected: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`);
  }
  return lines;
}

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
          status
          customerGets {
            value { ... on DiscountPercentage { percentage } }
            items {
              ... on AllDiscountItems { allItems }
              ... on DiscountProducts { productVariants(first: 250) { nodes { id } } }
            }
          }
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

export const AUTOMATIC_DISCOUNT_NODE_QUERY = `query flashSaleById($id: ID!) {
  automaticDiscountNode(id: $id) {
    id
    automaticDiscount {
      ... on DiscountAutomaticBasic { title status }
      ... on DiscountAutomaticBxgy { title status }
      ... on DiscountAutomaticFreeShipping { title status }
    }
  }
}`;

// `automaticDiscountNodes` rather than `discountNodes` with a search argument.
// The search string is not validated: an unknown field is ignored and returns
// every discount, while a known field with a value the API does not recognise
// returns none. `query: "type:automatic"` was the second kind, so this listing
// came back empty for every store and told a merchant a live sale was over.
// The dedicated connection is exact by construction and has no vocabulary to
// get wrong.
export const AUTOMATIC_DISCOUNTS_QUERY = `query flashSales($first: Int!) {
  automaticDiscountNodes(first: $first) {
    nodes {
      id
      automaticDiscount {
        ... on DiscountAutomaticBasic {
          title
          status
          startsAt
          endsAt
          customerGets {
            value { ... on DiscountPercentage { percentage } }
            items {
              ... on AllDiscountItems { allItems }
              ... on DiscountProducts { productVariants(first: 250) { nodes { id } } }
            }
          }
        }
        ... on DiscountAutomaticBxgy { title status startsAt endsAt }
        ... on DiscountAutomaticFreeShipping { title status startsAt endsAt }
      }
    }
  }
}`;

interface AutomaticDiscountCreateData {
  discountAutomaticBasicCreate?: {
    automaticDiscountNode?: {
      id?: string | null;
      automaticDiscount?: ObservedBasicDiscount | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface ObservedBasicDiscount {
  title?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: string | null;
  customerGets?: {
    value?: { percentage?: number | null } | null;
    items?: {
      allItems?: boolean | null;
      productVariants?: { nodes?: ({ id?: string | null } | null)[] | null } | null;
    } | null;
  } | null;
}

interface AutomaticDiscountDeleteData {
  discountAutomaticDelete?: {
    deletedAutomaticDiscountId?: string | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface AutomaticDiscountNodeData {
  automaticDiscountNode?: {
    id?: string | null;
    automaticDiscount?: { title?: string | null; status?: string | null } | null;
  } | null;
}

interface AutomaticDiscountsData {
  automaticDiscountNodes?: {
    nodes?: ({
      id?: string | null;
      automaticDiscount?: ObservedBasicDiscount | null;
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
export async function loadSaleVariants(
  ctx: ShopifyContext,
  variantIds: readonly string[],
): Promise<SaleVariant[]> {
  const data = await shopifyGraphql<VariantPricesData>(ctx, VARIANT_PRICES_QUERY, {
    ids: [...variantIds],
  });

  const found: SaleVariant[] = [];
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
    throw new ShopifyInputError(
      'variant_ids must list the variants the sale applies to when applies_to is "variants".',
    );
  }
  if (value.length > 250) {
    throw new ShopifyInputError("variant_ids cannot contain more than 250 variants.");
  }
  const ids = value.map((id) => requireVariantGid(id, "variant_ids"));
  if (new Set(ids).size !== ids.length) {
    throw new ShopifyInputError("variant_ids cannot name the same variant more than once.");
  }
  return ids;
}

function requireScope(value: unknown): FlashSaleScope {
  if (value === "entire_catalog" || value === "variants") return value;
  throw new ShopifyInputError('applies_to must be "entire_catalog" or "variants".');
}

function operationMarker(operationId?: string): string | null {
  return operationId
    ? createHash("sha256").update(operationId).digest("hex").slice(0, 24)
    : null;
}

function requireAutomaticDiscountGid(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ShopifyInputError("flash_sale_id is required.");
  }
  const raw = value.trim();
  const numeric = raw.startsWith("gid://shopify/DiscountAutomaticNode/")
    ? raw.slice("gid://shopify/DiscountAutomaticNode/".length)
    : raw;
  if (!/^\d+$/.test(numeric)) {
    throw new ShopifyInputError(
      "flash_sale_id must be a Shopify automatic discount ID — the number, or the full "
      + `gid://shopify/DiscountAutomaticNode/<id>. Got "${raw}".`,
    );
  }
  return `gid://shopify/DiscountAutomaticNode/${numeric}`;
}

function flashSaleFailure(
  ctx: ShopifyContext,
  result: ToolResult,
  outcome: "not_found" | "rejected" | "failed" | "unknown",
  code: string,
  providerReference: string | null = null,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "shop", id: ctx.shop },
    "create_flash_sale",
    outcome,
    code,
    providerReference,
  );
  return receipt ? { ...result, receipt } : result;
}

function endFlashSaleFailure(
  ctx: ShopifyContext,
  targetId: string | null,
  result: ToolResult,
  outcome: "not_found" | "rejected" | "failed" | "unknown",
  code: string,
  providerReference: string | null = null,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    targetId
      ? { kind: "discount", id: targetId }
      : { kind: "shop", id: ctx.shop },
    "end_flash_sale",
    outcome,
    code,
    providerReference,
  );
  return receipt ? { ...result, receipt } : result;
}

function confirmedEndFlashSale(
  ctx: ShopifyContext,
  flashSaleId: string,
  confirmation: EndFlashSaleReceiptFactsV1["confirmation"],
): ToolResult {
  const result = toolOk(
    confirmation === "deleted"
      ? "Ended the sale. Prices are back to normal — nothing was repriced, so nothing needs undoing."
      : "Confirmed the sale is no longer present at Shopify after the interrupted end request. Prices require no undoing because nothing was repriced.",
    { endedFlashSaleId: flashSaleId },
  );
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "discount", id: flashSaleId });
  if (!envelope) return result;
  const facts: EndFlashSaleReceiptFactsV1 = { flashSaleId, confirmation };
  const receipt: ReceiptV1 = {
    ...envelope,
    tool: "end_flash_sale",
    outcome: "succeeded",
    providerReference: flashSaleId,
    facts,
  };
  return { ...result, receipt };
}

async function reconcileEndedFlashSale(
  ctx: ShopifyContext,
  flashSaleId: string,
  mutationError: unknown,
): Promise<ToolResult> {
  try {
    const data = await shopifyGraphql<AutomaticDiscountNodeData>(
      ctx,
      AUTOMATIC_DISCOUNT_NODE_QUERY,
      { id: flashSaleId },
      { maxRetries: 1 },
    );
    if (!data.automaticDiscountNode) {
      return confirmedEndFlashSale(ctx, flashSaleId, "absent_after_ambiguous_response");
    }
    return endFlashSaleFailure(
      ctx,
      flashSaleId,
      toolUnknown(
        `Unknown: Shopify still returned the automatic discount after the interrupted end request. `
        + `It may still be running; check its status before trying again. `
        + formatShopifyToolError("end-sale reconciliation did not confirm deletion", mutationError),
      ),
      "unknown",
      "flash_sale_still_present_after_ambiguous_response",
    );
  } catch (error) {
    return endFlashSaleFailure(
      ctx,
      flashSaleId,
      toolUnknown(
        `Unknown: the sale may have ended at Shopify and the confirmation lookup failed. `
        + `Check the store's automatic discounts before trying again; it may still be running. `
        + formatShopifyToolError("end-sale reconciliation failed", error),
      ),
      "unknown",
      "end_flash_sale_reconciliation_failed",
    );
  }
}

function exactPercentage(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0 || value > 1) return null;
  return (value * 100).toFixed(8).replace(/(?:\.0+|(?<=[0-9])0+)$/, "").replace(/\.$/, "");
}

function sameInstant(left: string, right: Date): boolean {
  return Date.parse(left) === right.getTime();
}

function confirmedFlashSaleResult(params: {
  ctx: ShopifyContext;
  discountId: string;
  observed: ObservedBasicDiscount;
  scope: FlashSaleScope;
  variants: readonly SaleVariant[];
  requestedPercentage: number;
  expectedTitle: string;
  expectedStartsAt: Date;
  expectedEndsAt: Date;
}): ToolResult {
  const {
    ctx,
    discountId,
    observed,
    scope,
    variants,
    requestedPercentage,
    expectedTitle,
    expectedStartsAt,
    expectedEndsAt,
  } = params;
  const providerPercentage = typeof observed.customerGets?.value?.percentage === "number"
    ? exactPercentage(observed.customerGets.value.percentage)
    : null;
  const observedVariantIds = observed.customerGets?.items?.productVariants?.nodes
    ?.flatMap((node) => node?.id ? [node.id] : []) ?? [];
  const expectedVariantIds = variants.map((variant) => variant.variantId);
  const targetMatches = scope === "entire_catalog"
    ? observed.customerGets?.items?.allItems === true && observedVariantIds.length === 0
    : observed.customerGets?.items?.allItems !== true
      && observedVariantIds.length === expectedVariantIds.length
      && expectedVariantIds.every((id) => observedVariantIds.includes(id));
  const complete = providerPercentage !== null
    && observed.title === expectedTitle
    && Number(providerPercentage) === requestedPercentage
    && typeof observed.startsAt === "string"
    && typeof observed.endsAt === "string"
    && sameInstant(observed.startsAt, expectedStartsAt)
    && sameInstant(observed.endsAt, expectedEndsAt)
    && typeof observed.status === "string"
    && observed.status.trim().length > 0
    && targetMatches;
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "shop", id: ctx.shop });
  if (envelope && !complete) {
    return flashSaleFailure(
      ctx,
      toolUnknown("Unknown: Shopify created a discount but did not return enough matching state to verify the flash sale. Check automatic discounts before starting another."),
      "unknown",
      "incomplete_flash_sale_receipt",
      discountId,
    );
  }

  const result = toolOk(
    [
      `Started "${observed.title ?? "Shopkeeper flash sale"}".`,
      ...describeSale(scope, variants, requestedPercentage, expectedEndsAt),
      `End it early with end_flash_sale and this ID: ${discountId}`,
    ].join("\n"),
    {
      flashSaleId: discountId,
      appliesTo: scope,
      ...(scope === "variants" ? { variantCount: variants.length } : {}),
      discountPercent: requestedPercentage,
      endsAt: expectedEndsAt.toISOString(),
    },
  );
  if (!envelope || !complete) return result;
  const facts: FlashSaleReceiptFactsV1 = {
    flashSaleId: discountId,
    appliesTo: scope,
    variantIds: scope === "variants" ? observedVariantIds : [],
    discountPercentage: providerPercentage!,
    startsAt: observed.startsAt!,
    endsAt: observed.endsAt!,
    providerStatus: observed.status!,
  };
  const receipt: ReceiptV1 = {
    ...envelope,
    tool: "create_flash_sale",
    outcome: "succeeded",
    providerReference: discountId,
    facts,
  };
  return { ...result, receipt };
}

interface ExpectedFlashSale {
  title: string;
  scope: FlashSaleScope;
  variants: readonly SaleVariant[];
  percentage: number;
  startsAt: Date;
  endsAt: Date;
}

async function reconcileCreatedFlashSale(
  ctx: ShopifyContext,
  expected: ExpectedFlashSale,
  mutationError: unknown,
): Promise<ToolResult> {
  try {
    const data = await shopifyGraphql<AutomaticDiscountsData>(
      ctx,
      AUTOMATIC_DISCOUNTS_QUERY,
      { first: 100 },
      { maxRetries: 1 },
    );
    const matches = (data.automaticDiscountNodes?.nodes ?? []).filter((node) => (
      node?.id && node.automaticDiscount?.title === expected.title
    ));
    if (matches.length === 1) {
      const match = matches[0]!;
      return confirmedFlashSaleResult({
        ctx,
        discountId: match.id!,
        observed: match.automaticDiscount!,
        scope: expected.scope,
        variants: expected.variants,
        requestedPercentage: expected.percentage,
        expectedTitle: expected.title,
        expectedStartsAt: expected.startsAt,
        expectedEndsAt: expected.endsAt,
      });
    }
    return flashSaleFailure(
      ctx,
      toolUnknown(
        `Unknown: the sale request may have committed at Shopify, but an operation-tag lookup did not find exactly one complete matching discount. Check automatic discounts before starting another. ${formatShopifyToolError("flash sale reconciliation failed", mutationError)}`,
      ),
      "unknown",
      matches.length > 1 ? "multiple_flash_sale_matches" : "flash_sale_not_confirmed",
    );
  } catch (error) {
    return flashSaleFailure(
      ctx,
      toolUnknown(
        `Unknown: the sale may have started at Shopify and its operation-tag lookup failed. Check automatic discounts before starting another. ${formatShopifyToolError("flash sale reconciliation failed", error)}`,
      ),
      "unknown",
      "flash_sale_reconciliation_failed",
    );
  }
}

export async function createFlashSale(
  input: CreateFlashSaleInput,
  ctx: ShopifyContext,
  now: Date = new Date(),
): Promise<ToolResult> {
  let mutationStarted = false;
  let expected: ExpectedFlashSale | null = null;
  try {
    const percentage = requirePercentage(input.discount_percentage);
    const hours = requireHours(input.duration_hours);
    const scope = requireScope(input.applies_to);
    const name = typeof input.name === "string" ? input.name.trim() : "";

    // Only the enumerated form has variants to resolve. A catalog-wide sale
    // names no products at all, so there is nothing to look up and nothing that
    // can be missing.
    let variants: SaleVariant[] = [];
    if (scope === "variants") {
      const variantIds = requireVariantIds(input.variant_ids);
      variants = await loadSaleVariants(ctx, variantIds);
      if (variants.length === 0) {
        return flashSaleFailure(
          ctx,
          toolNotFound("None of those variant IDs exist in this store."),
          "not_found",
          "flash_sale_variants_not_found",
        );
      }
      if (variants.length !== variantIds.length) {
        const found = new Set(variants.map((variant) => variant.variantId));
        const missing = variantIds.filter((id) => !found.has(id));
        return flashSaleFailure(
          ctx,
          toolNotFound(
            `Error: ${missing.length} of those variant IDs do not exist in this store, so nothing was `
            + `applied: ${missing.join(", ")}.`,
          ),
          "not_found",
          "flash_sale_variants_not_found",
        );
      }
    }

    const endsAt = new Date(now.getTime() + hours * 3_600_000);
    const marker = operationMarker(ctx.operationId);
    const title = `${TITLE_PREFIX}: ${name || `${percentage}% off`}${marker ? ` [op:${marker}]` : ""}`;
    expected = { title, scope, variants, percentage, startsAt: now, endsAt };
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
          endsAt: endsAt.toISOString(),
          minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: "1" } },
          customerGets: {
            items: scope === "entire_catalog"
              ? { all: true }
              : { products: { productVariantsToAdd: variants.map((v) => v.variantId) } },
            value: { percentage: percentage / 100 },
          },
        },
      },
    );

    const payload = data.discountAutomaticBasicCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) {
      return flashSaleFailure(
        ctx,
        toolError(`Error: could not start the sale - ${userErrors}`),
        "failed",
        "provider_rejected_flash_sale",
      );
    }
    const id = payload?.automaticDiscountNode?.id;
    if (!id) {
      return flashSaleFailure(
        ctx,
        toolUnknown("Unknown: Shopify did not return the created discount. Check automatic discounts before starting another."),
        "unknown",
        "missing_flash_sale_identity",
      );
    }
    return confirmedFlashSaleResult({
      ctx,
      discountId: id,
      observed: payload.automaticDiscountNode?.automaticDiscount ?? {},
      scope,
      variants,
      requestedPercentage: percentage,
      expectedTitle: title,
      expectedStartsAt: now,
      expectedEndsAt: endsAt,
    });
  } catch (err) {
    if (err instanceof ShopifyInputError) {
      return flashSaleFailure(
        ctx,
        toolPolicyBlock(`Error: ${err.message}`),
        "rejected",
        "invalid_flash_sale_input",
      );
    }
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      if (expected && operationMarker(ctx.operationId)) {
        return reconcileCreatedFlashSale(ctx, expected, err);
      }
      return flashSaleFailure(
        ctx,
        toolUnknown(
          `Unknown: the sale may have started at Shopify but could not be confirmed. `
          + `Check the store's automatic discounts before starting another — a second one would `
          + `stack a further markdown on the same variants. `
          + formatShopifyToolError("flash sale reconciliation failed", err),
        ),
        "unknown",
        "ambiguous_flash_sale_submission",
      );
    }
    return flashSaleFailure(
      ctx,
      toolError(formatShopifyToolError("failed to start the sale", err)),
      "failed",
      mutationStarted ? "definite_flash_sale_failure" : "pre_dispatch_failure",
    );
  }
}

/**
 * The sales a merchant would call running. Status is checked here because the
 * connection returns every automatic discount the store has ever had, and an
 * expired one offered as endable is the same lie as a live one hidden.
 */
export function readFlashSales(data: AutomaticDiscountsData): FlashSaleSummary[] {
  const sales: FlashSaleSummary[] = [];
  for (const node of data.automaticDiscountNodes?.nodes ?? []) {
    const discount = node?.automaticDiscount;
    if (!node?.id || !discount?.title) continue;
    if (discount.status !== "ACTIVE") continue;
    sales.push({
      id: node.id,
      title: discount.title,
      status: discount.status,
      endsAt: discount.endsAt ?? null,
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
  let flashSaleId: string | null = null;
  try {
    const rawId = typeof input.flash_sale_id === "string" ? input.flash_sale_id.trim() : "";
    if (!rawId) {
      const running = await listFlashSales(ctx);
      if (running.length === 0) {
        return toolNotFound(
          "Checked this store's automatic discounts: none are running, so there was "
          + "no sale to end.",
        );
      }
      const lines = running.map((sale) => (
        `- ${sale.title} (${sale.id})${sale.endsAt ? ` ends ${sale.endsAt}` : ""}`
      ));
      return toolOk(
        ["Running automatic discounts — call end_flash_sale with one of these IDs:", ...lines]
          .join("\n"),
        { sales: running },
      );
    }

    flashSaleId = requireAutomaticDiscountGid(rawId);

    mutationStarted = true;
    const data = await shopifyGraphql<AutomaticDiscountDeleteData>(
      ctx,
      AUTOMATIC_DISCOUNT_DELETE_MUTATION,
      { id: flashSaleId },
    );
    const payload = data.discountAutomaticDelete;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) {
      return endFlashSaleFailure(
        ctx,
        flashSaleId,
        toolError(`Error: could not end the sale - ${userErrors}`),
        "failed",
        "provider_rejected_end_flash_sale",
      );
    }
    if (!payload) {
      return endFlashSaleFailure(
        ctx,
        flashSaleId,
        toolUnknown(
          "Unknown: Shopify did not return the deletion result. Check automatic discounts before trying again.",
        ),
        "unknown",
        "missing_end_flash_sale_result",
      );
    }
    if (!payload.deletedAutomaticDiscountId) {
      return endFlashSaleFailure(
        ctx,
        flashSaleId,
        toolNotFound(`No automatic discount with ID ${flashSaleId} is running.`),
        "not_found",
        "flash_sale_not_found",
      );
    }
    if (payload.deletedAutomaticDiscountId !== flashSaleId) {
      return endFlashSaleFailure(
        ctx,
        flashSaleId,
        toolUnknown(
          "Unknown: Shopify returned a different deleted discount ID. Check automatic discounts before trying again.",
        ),
        "unknown",
        "mismatched_deleted_flash_sale_identity",
        payload.deletedAutomaticDiscountId,
      );
    }

    return confirmedEndFlashSale(ctx, flashSaleId, "deleted");
  } catch (err) {
    if (mutationStarted && flashSaleId && isAmbiguousShopifyMutationError(err)) {
      // Ending is the safe direction — the risk of a lost confirmation here is a
      // sale the merchant believes is over and is in fact still discounting.
      return reconcileEndedFlashSale(ctx, flashSaleId, err);
    }
    if (err instanceof ShopifyInputError) {
      return endFlashSaleFailure(
        ctx,
        flashSaleId,
        toolPolicyBlock(`Error: ${err.message}`),
        "rejected",
        "invalid_end_flash_sale_input",
      );
    }
    return endFlashSaleFailure(
      ctx,
      flashSaleId,
      toolError(formatShopifyToolError("failed to end the sale", err)),
      "failed",
      mutationStarted ? "definite_end_flash_sale_failure" : "pre_dispatch_failure",
    );
  }
}
