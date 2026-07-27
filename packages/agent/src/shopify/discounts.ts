import type { IssueDiscountInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyIdempotencyKey,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import { ShopifyInputError } from "./validation.js";

interface DiscountCodeBasicCreateData {
  discountCodeBasicCreate?: {
    codeDiscountNode?: {
      codeDiscount?: {
        codes?: { nodes?: { code: string }[] };
        endsAt?: string | null;
      } | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface DiscountCodesByCodeData {
  codeDiscountNodeByCode?: {
    id?: string | null;
    codeDiscount?: {
      codes?: { nodes?: Array<{ code?: string | null }> } | null;
    } | null;
  } | null;
}

export const DISCOUNT_CODE_BASIC_CREATE_MUTATION = `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            codeDiscount {
              ... on DiscountCodeBasic {
                codes(first: 1) { nodes { code } }
                endsAt
              }
            }
          }
          userErrors { field message }
        }
      }`;

export const DISCOUNT_CODES_BY_CODE_QUERY = `query DiscountCodeByCode($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      ... on DiscountCodeBasic {
        codes(first: 2) { nodes { code } }
      }
    }
  }
}`;

// Stable for an execution-ledger operation so a retry and its reconciliation
// probe search for the same code. Direct callers without an operation id still
// get a fresh key for that invocation.
export function discountCodeForOperation(percentage: number, operationId?: string): string {
  const suffix = shopifyIdempotencyKey(operationId).replaceAll("-", "").slice(0, 8).toUpperCase();
  return `THANKS${percentage}-${suffix}`;
}

export async function findDiscountsByCode(
  ctx: ShopifyContext,
  code: string,
): Promise<Array<{ id: string; code: string }>> {
  const data = await shopifyGraphql<DiscountCodesByCodeData>(
    ctx,
    DISCOUNT_CODES_BY_CODE_QUERY,
    { code },
    { maxRetries: 1 },
  );
  const node = data.codeDiscountNodeByCode;
  if (!node?.id) return [];
  return (node.codeDiscount?.codes?.nodes ?? []).some((entry) => entry.code === code)
    ? [{ id: node.id, code }]
    : [];
}

function requirePercentage(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100) {
    throw new ShopifyInputError("percentage must be a number greater than 0 and at most 100.");
  }
  return value;
}

function requireExpiryDays(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ShopifyInputError("expires_in_days must be a positive integer.");
  }
  return value;
}

export async function issueDiscount(
  input: IssueDiscountInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  let mutationStarted = false;
  let code: string | null = null;
  try {
    const percentage = requirePercentage(input.percentage);
    const expiresInDays = requireExpiryDays(input.expires_in_days);
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    code = discountCodeForOperation(percentage, ctx.operationId);
    const endsAt = expiresInDays !== undefined
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    // The execution path always has a stable operation id. A preflight makes a
    // replay idempotent through Shopify's direct code lookup, avoiding the
    // lagging search index used by codeDiscountNodes(query:).
    if (ctx.operationId) {
      const existing = await findDiscountsByCode(ctx, code);
      if (existing.length === 1) {
        return toolOk(`Created a single-use ${percentage}% discount code ${code} (confirmed from an earlier attempt). Tell the customer this code so they can use it at checkout on their next order.`);
      }
      if (existing.length > 1) {
        return toolUnknown(`Unknown: multiple Shopify discounts use operation code ${code}. Do not issue another discount or give a code to the customer until they are reviewed.`);
      }
    }

    mutationStarted = true;
    const data = await shopifyGraphql<DiscountCodeBasicCreateData>(
      ctx,
      DISCOUNT_CODE_BASIC_CREATE_MUTATION,
      {
        basicCodeDiscount: {
          title: reason ? `Goodwill ${percentage}% off — ${reason}` : `Goodwill ${percentage}% off`,
          code,
          startsAt: new Date().toISOString(),
          ...(endsAt ? { endsAt } : {}),
          customerSelection: { all: true },
          customerGets: {
            items: { all: true },
            value: { percentage: percentage / 100 },
          },
          appliesOncePerCustomer: true,
          usageLimit: 1,
        },
      }
    );

    const payload = data.discountCodeBasicCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) return toolError(`Error: could not create discount code - ${userErrors}`);
    if (!payload?.codeDiscountNode) {
      return toolError("Error: could not create discount code - Shopify did not return a discount.");
    }

    const createdCode = payload.codeDiscountNode.codeDiscount?.codes?.nodes?.[0]?.code ?? code;
    const expiryNote = expiresInDays !== undefined ? ` It expires in ${expiresInDays} day(s).` : "";
    return toolOk(
      `Created a single-use ${percentage}% discount code ${createdCode}.${expiryNote} Tell the customer this code so they can use it at checkout on their next order.`
    );
  } catch (err) {
    if (err instanceof ShopifyInputError) return toolError(`Error: ${err.message}`);
    if (mutationStarted && code && isAmbiguousShopifyMutationError(err)) {
      return toolUnknown(
        `Unknown: discount code ${code} may have been created at Shopify, but it could not be confirmed. Do not issue another discount or give this code to the customer until it is reconciled. ${formatShopifyToolError("discount reconciliation failed", err)}`,
      );
    }
    return toolError(formatShopifyToolError("failed to create discount code", err));
  }
}
