import type { IssueStoreCreditInput, SpendToolResult } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk } from "../tools/result.js";
import { moneyToCents, requireAmount, requireNumericId } from "./validation.js";
import { ShopifyInputError } from "./validation.js";

function requireExpiryDays(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ShopifyInputError("expires_in_days must be a positive integer.");
  }
  return value;
}

interface ShopCurrencyData {
  shop?: { currencyCode?: string | null } | null;
}

interface StoreCreditCreditData {
  storeCreditAccountCredit?: {
    storeCreditAccountTransaction?: {
      amount?: { amount?: string | null; currencyCode?: string | null } | null;
      account?: {
        balance?: { amount?: string | null; currencyCode?: string | null } | null;
      } | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

function spendError(message: string): SpendToolResult {
  return { ...toolError(message), spentCents: null };
}

export async function issueStoreCredit(
  input: IssueStoreCreditInput,
  ctx: ShopifyContext
): Promise<SpendToolResult> {
  try {
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const amount = requireAmount(input.amount, "amount");
    const expiresInDays = requireExpiryDays(input.expires_in_days);

    const shopData = await shopifyGraphql<ShopCurrencyData>(ctx, `query { shop { currencyCode } }`, {});
    const currencyCode = shopData.shop?.currencyCode;
    if (!currencyCode) {
      return spendError("Error: could not issue store credit - the store's currency could not be determined.");
    }

    const creditInput: Record<string, unknown> = {
      creditAmount: { amount, currencyCode },
    };
    if (expiresInDays !== undefined) {
      creditInput.expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    }

    const data = await shopifyGraphql<StoreCreditCreditData>(
      ctx,
      `mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
        storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
          storeCreditAccountTransaction {
            amount { amount currencyCode }
            account { balance { amount currencyCode } }
          }
          userErrors { field message }
        }
      }`,
      { id: `gid://shopify/Customer/${customerId}`, creditInput }
    );

    const payload = data.storeCreditAccountCredit;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) {
      return spendError(`Error: could not issue store credit - ${userErrors}. If store credit is not enabled for this store, use create_gift_card for the same amount instead.`);
    }

    const transaction = payload?.storeCreditAccountTransaction;
    if (!transaction) {
      return spendError("Error: could not issue store credit - Shopify did not return a transaction. If store credit is not enabled for this store, use create_gift_card for the same amount instead.");
    }

    const balance = transaction.account?.balance;
    const balanceNote = balance?.amount ? ` Their store credit balance is now $${balance.amount} ${balance.currencyCode ?? currencyCode}.` : "";
    const expiryNote = expiresInDays !== undefined ? ` The credit expires in ${expiresInDays} day(s).` : "";
    return {
      ...toolOk(
        `Added $${amount} ${currencyCode} of store credit to the customer's account.${balanceNote}${expiryNote} It applies automatically at checkout when they are logged in - tell the customer in your reply.`
      ),
      spentCents: moneyToCents(amount),
    };
  } catch (err) {
    return spendError(formatShopifyToolError("failed to issue store credit", err));
  }
}
