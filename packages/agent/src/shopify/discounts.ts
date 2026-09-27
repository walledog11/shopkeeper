import { shopifyIdempotencyKey, shopifyGraphql, type ShopifyContext } from "./client.js";

interface DiscountCodesByCodeData {
  codeDiscountNodeByCode?: {
    id?: string | null;
    codeDiscount?: {
      codes?: { nodes?: Array<{ code?: string | null }> } | null;
    } | null;
  } | null;
}

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
