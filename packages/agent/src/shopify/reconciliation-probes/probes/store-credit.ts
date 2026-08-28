import type { IssueStoreCreditInput } from "../../../tools/index.js";
import { shopifyGraphql, type ShopifyContext } from "../../client.js";
import { moneyToCents, requireAmount, requireNumericId } from "../../validation.js";
import { CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY } from "../queries.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeStoreCredit(
  input: IssueStoreCreditInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const customerId = requireNumericId(input.customer_id, "customer_id");
  const amount = requireAmount(input.amount, "amount");
  const data = await shopifyGraphql<{
    customer?: {
      storeCreditAccounts?: {
        nodes?: Array<{
          transactions?: {
            nodes?: Array<{
              __typename?: string | null;
              amount?: { amount?: string | null } | null;
            }>;
          } | null;
        }>;
      } | null;
    } | null;
  }>(ctx, CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY, { id: `gid://shopify/Customer/${customerId}` }, { maxRetries: 1 });
  const transactions = data.customer?.storeCreditAccounts?.nodes?.[0]?.transactions?.nodes ?? [];
  // Direction is the transaction's type, not its `event`: a credit issued by
  // storeCreditAccountCredit comes back as ADJUSTMENT, so the earlier
  // `event === "CREDIT"` test matched nothing and reported every committed
  // credit as no_effect. `event` says why the balance moved; `__typename` says
  // which way.
  const matches = transactions.filter((transaction) => (
    transaction.__typename === "StoreCreditAccountCreditTransaction"
    && moneyToCents(transaction.amount?.amount ?? "0") === moneyToCents(amount)
  ));
  if (matches.length === 1) {
    return committed(`Reconciled $${amount} store credit for customer ${customerId}.`, moneyToCents(amount));
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple store-credit transactions match customer ${customerId} and amount $${amount}.`);
  }
  return noEffect(`No store-credit transaction matching $${amount} was found for customer ${customerId}.`);
}
