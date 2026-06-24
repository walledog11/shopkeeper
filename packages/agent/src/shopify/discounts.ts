import type { IssueDiscountInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, type ToolResult } from "../tools/result.js";
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

// Excludes visually ambiguous characters (0/O, 1/I) so the code is easy to read aloud and retype.
const DISCOUNT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateDiscountCode(percentage: number): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += DISCOUNT_CODE_ALPHABET[Math.floor(Math.random() * DISCOUNT_CODE_ALPHABET.length)];
  }
  return `THANKS${percentage}-${suffix}`;
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
  try {
    const percentage = requirePercentage(input.percentage);
    const expiresInDays = requireExpiryDays(input.expires_in_days);
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const code = generateDiscountCode(percentage);
    const endsAt = expiresInDays !== undefined
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const data = await shopifyGraphql<DiscountCodeBasicCreateData>(
      ctx,
      `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
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
      }`,
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
    return toolError(formatShopifyToolError("failed to create discount code", err));
  }
}
