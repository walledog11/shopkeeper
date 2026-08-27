import {
  parseToolInput,
  type AttachReturnLabelInput,
  type CancelOrderInput,
  type CreateExchangeInput,
  type CreateGiftCardInput,
  type CreatePartialRefundInput,
  type CreateRefundInput,
  type CreateReturnInput,
  type CreateShopifyOrderInput,
  type EditShopifyOrderInput,
  type FulfillOrderInput,
  type IssueDiscountInput,
  type IssueStoreCreditInput,
  type ToolName,
  type UpdateShopifyOrderAddressInput,
} from "../tools/index.js";
import { discountCodeForOperation, findDiscountsByCode } from "./discounts.js";
import { fetchFulfillableFulfillmentOrders, fetchOrderFulfillmentTrackingNumbers } from "./fulfillment.js";
import { addressMatches, buildOrderAddress } from "./order-address.js";
import { OPEN_RETURN_STATUSES } from "./return-labels.js";
import { fetchReturnableLineItems } from "./returns.js";
import {
  formatShopifyToolError,
  shopifyGraphql,
  shopifyIdempotencyKey,
  shopifyOperationTag,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import type { ShopifyOrder, ShopifyOrderLineItem } from "./types.js";
import { moneyToCents, optionalString, requireAmount, requireNumericId } from "./validation.js";

export type ShopifyReconciliationProbeResult =
  | { outcome: "committed"; message: string; spentCents?: number | null }
  | { outcome: "no_effect"; message: string }
  | { outcome: "still_unknown"; message: string };

export const GIFT_CARDS_BY_CODE_QUERY = `query GiftCardsByCode($query: String!) {
  giftCards(first: 2, query: $query) {
    nodes { id initialValue { amount } note }
  }
}`;

export const RECENT_GIFT_CARDS_QUERY = `query RecentGiftCards {
  giftCards(first: 50, sortKey: CREATED_AT, reverse: true) {
    nodes { id initialValue { amount } note lastCharacters }
  }
}`;

export const CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY = `query CustomerStoreCreditTransactions($id: ID!) {
  customer(id: $id) {
    storeCreditAccounts(first: 1) {
      nodes {
        transactions(first: 10, reverse: true) {
          nodes {
            __typename
            amount { amount }
          }
        }
      }
    }
  }
}`;

export const RETURN_RECONCILIATION_QUERY = `query ShopkeeperReturnReconciliation($id: ID!) {
  order(id: $id) {
    returns(first: 10) {
      edges {
        node {
          id
          name
          status
          reverseFulfillmentOrders(first: 5) {
            edges {
              node {
                reverseDeliveries(first: 10) {
                  edges {
                    node {
                      deliverable {
                        ... on ReverseDeliveryShippingDeliverable {
                          tracking { number }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

// Null, not a generated tag: without a stable operation identity there is
// nothing to search for, and a fresh random tag would match nothing and read as
// a confident no_effect.
function operationTag(operationId?: string): string | null {
  if (!operationId) return null;
  return shopifyOperationTag(operationId);
}

function giftCardCode(operationId?: string): string | null {
  if (!operationId) return null;
  return shopifyIdempotencyKey(operationId).replaceAll("-", "").slice(0, 20);
}

function stillUnknown(message: string): ShopifyReconciliationProbeResult {
  return { outcome: "still_unknown", message };
}

function committed(message: string, spentCents?: number | null): ShopifyReconciliationProbeResult {
  return { outcome: "committed", message, spentCents };
}

function noEffect(message: string): ShopifyReconciliationProbeResult {
  return { outcome: "no_effect", message };
}

async function probeRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const requestedAmount = input.amount !== undefined ? requireAmount(input.amount, "amount") : null;
  const requestedCents = requestedAmount ? moneyToCents(requestedAmount) : null;

  const data = await shopifyRestJson<{ refunds?: Array<{ id: number; transactions?: Array<{ status?: string; amount?: string }> }> }>(
    ctx,
    `orders/${orderId}/refunds.json`,
    { maxRetries: 1 },
  );
  const refunds = data.refunds ?? [];
  const successful = refunds.filter((refund) => (
    (refund.transactions ?? []).some((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
  ));
  const matches = successful.filter((refund) => {
    if (requestedCents === null) return true;
    const total = (refund.transactions ?? [])
      .filter((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount ?? "0"), 0);
    return total === requestedCents;
  });

  if (matches.length === 1) {
    const total = (matches[0]!.transactions ?? [])
      .filter((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount ?? "0"), 0);
    return committed(
      `Reconciled refund on order ${orderId} for $${(total / 100).toFixed(2)}.`,
      total,
    );
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple successful refunds match order ${orderId}; manual review required.`);
  }
  if (successful.length > 0 && requestedCents === null) {
    return stillUnknown(`Order ${orderId} has successful refunds but the requested amount is unknown.`);
  }
  return noEffect(`No successful refund matching order ${orderId} was found at Shopify.`);
}

async function probeCancellation(
  input: CancelOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,cancelled_at,cancel_reason,financial_status" },
    maxRetries: 1,
  });
  if (!data.order?.cancelled_at) {
    return noEffect(`Order ${orderId} is not cancelled at Shopify.`);
  }
  const expectedReason = (input.reason ?? "other").toLowerCase();
  const actualReason = data.order.cancel_reason?.toLowerCase();
  if (actualReason && actualReason !== expectedReason) {
    return stillUnknown(
      `Order ${orderId} is cancelled with reason "${actualReason}" instead of "${expectedReason}".`,
    );
  }
  return committed(`Reconciled cancellation for order ${data.order.name ?? orderId}.`);
}

// Shopify's order search index lags writes, so reconciliation uses the required
// customer email to query orders directly and filters the result by operation
// tag. A miss remains unknown because visibility cannot prove non-creation.
const ORDER_LOOKUP_ATTEMPTS = 3;
const ORDER_LOOKUP_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// REST returns an order's tags as one comma-separated string, unlike GraphQL,
// which returns a list. Comparing the raw string would match a tag that is
// merely a prefix of another.
function restOrderTags(order: { tags?: unknown }): string[] {
  return String(order.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function findCreatedOrdersByEmail(
  ctx: ShopifyContext,
  email: string,
  tag: string,
): Promise<Array<{ id: string; name?: string }>> {
  const data = await shopifyRestJson<{ orders?: Array<ShopifyOrder & { tags?: string }> }>(
    ctx,
    "orders.json",
    { query: { email, status: "any", fields: "id,name,tags" }, maxRetries: 1 },
  );
  return (data.orders ?? [])
    .filter((order) => restOrderTags(order).includes(tag))
    .map((order) => ({ id: String(order.id), name: order.name }));
}

async function probeCreatedOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const tag = operationTag(ctx.operationId);
  if (!tag) {
    return stillUnknown("Order creation reconciliation requires a stable operation identity.");
  }
  const email = input.email;

  for (let attempt = 0; attempt < ORDER_LOOKUP_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(ORDER_LOOKUP_BACKOFF_MS);
    const matches = await findCreatedOrdersByEmail(ctx, email, tag);
    if (matches.length === 1) {
      return committed(`Reconciled created order ${matches[0]!.name ?? matches[0]!.id}.`);
    }
    if (matches.length > 1) {
      return stillUnknown(`Multiple Shopify orders match operation tag ${tag}.`);
    }
  }

  // Deliberately not `no_effect`. An exhausted lookup cannot distinguish "never
  // created" from "created and not yet visible", and the two call for opposite
  // moves: no_effect releases the hold and invites a second create, which for
  // this tool means a duplicate real order against a customer.
  // `order-creation.ts`'s own post-failure reconciliation already refuses to
  // conclude from the same miss; this matches it.
  return stillUnknown(
    `No Shopify order with operation tag ${tag} was found for ${email} after ${ORDER_LOOKUP_ATTEMPTS} attempts. This does not prove the order was not created — review it before creating another.`,
  );
}

async function probeGiftCard(
  input: CreateGiftCardInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const code = giftCardCode(ctx.operationId);
  if (!code) {
    return stillUnknown("Gift-card reconciliation requires a stable operation identity.");
  }
  const amount = requireAmount(input.amount, "amount");
  const data = await shopifyGraphql<{
    giftCards?: {
      nodes?: Array<{
        id?: string | null;
        initialValue?: { amount?: string | null } | null;
        note?: string | null;
      }>;
    } | null;
  }>(ctx, GIFT_CARDS_BY_CODE_QUERY, { query: `code:${code}` }, { maxRetries: 1 });
  const matches = (data.giftCards?.nodes ?? []).filter((card) => (
    card.id
    && moneyToCents(card.initialValue?.amount ?? "0") === moneyToCents(amount)
    && card.note?.includes(`Shopkeeper operation: ${code}`)
  ));
  if (matches.length === 1) {
    return committed(`Reconciled gift card with code ${code}.`, moneyToCents(amount));
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple gift cards match code ${code}.`);
  }

  // Shopify can return a conclusive giftCardCreate payload while its `code:`
  // search still returns no rows. Fall back to the recent-card list and match
  // both the operation note and last characters; neither field alone is a safe
  // identity. A miss remains unknown because search/list visibility cannot
  // prove that a successfully returned card was never created.
  const recent = await shopifyGraphql<{
    giftCards?: {
      nodes?: Array<{
        id?: string | null;
        initialValue?: { amount?: string | null } | null;
        note?: string | null;
        lastCharacters?: string | null;
      }>;
    } | null;
  }>(ctx, RECENT_GIFT_CARDS_QUERY, {}, { maxRetries: 1 });
  const recentMatches = (recent.giftCards?.nodes ?? []).filter((card) => (
    card.id
    && moneyToCents(card.initialValue?.amount ?? "0") === moneyToCents(amount)
    && card.note?.includes(`Shopkeeper operation: ${code}`)
    && card.lastCharacters?.toLowerCase() === code.slice(-4).toLowerCase()
  ));
  if (recentMatches.length === 1) {
    return committed(`Reconciled gift card with code ${code}.`, moneyToCents(amount));
  }
  if (recentMatches.length > 1) {
    return stillUnknown(`Multiple recent gift cards match code ${code}.`);
  }
  return stillUnknown(`No gift card with code ${code} was visible at Shopify; creation cannot be ruled out.`);
}

async function probeStoreCredit(
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

function lineItemQuantity(item: ShopifyOrderLineItem): number {
  const quantity = item.current_quantity ?? item.quantity;
  return Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
}

function variantQuantities(order: ShopifyOrder): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of order.line_items ?? []) {
    if (item.variant_id == null) continue;
    const key = String(item.variant_id);
    quantities.set(key, (quantities.get(key) ?? 0) + lineItemQuantity(item));
  }
  return quantities;
}

async function probeOrderEdit(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,line_items" },
    maxRetries: 1,
  });
  if (!data.order) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }
  const current = variantQuantities(data.order);
  const addVariantId = optionalString(input.variant_id);
  const removeVariantId = optionalString(input.remove_variant_id);
  if (!addVariantId && !removeVariantId) {
    return stillUnknown("Order-edit reconciliation requires variant_id or remove_variant_id.");
  }

  // `edit_shopify_order` adds a *delta*, so the order as it stands cannot say on
  // its own whether that delta was applied: order-edit.ts:290 compares against
  // pre-edit quantity plus the delta, and the probe has no pre-edit reading. A
  // quantity that merely satisfies the request is therefore not evidence the
  // request ran — an order that already held enough of the variant read as
  // committed for an edit that never happened. `null` is "cannot tell".
  const legs: Array<boolean | null> = [];
  if (removeVariantId) {
    // The tool refuses to remove a variant the order does not carry, so the line
    // existed when the mutation went out: absent now means the removal ran.
    const key = requireNumericId(removeVariantId, "remove_variant_id");
    legs.push((current.get(key) ?? 0) === 0);
  }
  if (addVariantId) {
    // Only the negative is conclusive. A committed add leaves at least the
    // requested quantity behind, so nothing at all rules it out; any other count
    // is indistinguishable from a line that was already there.
    const key = requireNumericId(addVariantId, "variant_id");
    legs.push((current.get(key) ?? 0) === 0 ? false : null);
  }

  if (legs.every((leg) => leg === false)) {
    return noEffect(`Order ${orderId} does not reflect the requested edit at Shopify.`);
  }
  if (legs.every((leg) => leg === true)) {
    return committed(`Reconciled order edit for order ${data.order.name ?? orderId}.`);
  }
  // A swap whose halves disagree lands here too, which is the point: half an
  // edit is not a committed edit and must not read as one.
  return stillUnknown(
    `Order ${orderId} cannot be reconciled against the requested edit from its current line items alone.`,
  );
}

async function probeOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const expected = buildOrderAddress(input);
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,shipping_address" },
    maxRetries: 1,
  });
  const actual = data.order?.shipping_address;
  if (!actual) {
    return noEffect(`Order ${orderId} has no shipping address at Shopify.`);
  }
  // Compare with the same predicate the tool itself commits on, not a second
  // copy of it: Shopify returns a country as "United States" while the input
  // carries "US", so a field-by-field string compare read every committed
  // update on a country-code input as a no-op.
  if (addressMatches(actual, expected)) {
    return committed(`Reconciled shipping-address update for order ${data.order?.name ?? orderId}.`);
  }
  return noEffect(`Order ${orderId} shipping address does not match the requested update.`);
}

interface ProbeReturn {
  id: string;
  name: string | null;
  status: string | null;
  trackingNumbers: string[];
}

// The tool's own lookup selects the first open return and stops; the probe needs
// every one of them to tell "exactly ours" from "ours plus another". Same
// question, so `OPEN_RETURN_STATUSES` is shared - but a different shape, and the
// tool's query is not widened to carry reverse deliveries it never reads.
async function fetchProbeReturns(ctx: ShopifyContext, orderGid: string): Promise<ProbeReturn[]> {
  const data = await shopifyGraphql<{
    order?: {
      returns?: {
        edges: {
          node: {
            id: string;
            name?: string | null;
            status?: string | null;
            reverseFulfillmentOrders?: {
              edges: {
                node: {
                  reverseDeliveries?: {
                    edges: { node: { deliverable?: { tracking?: { number?: string | null } | null } | null } }[];
                  } | null;
                };
              }[];
            } | null;
          };
        }[];
      } | null;
    } | null;
  }>(ctx, RETURN_RECONCILIATION_QUERY, { id: orderGid }, { maxRetries: 1 });

  return (data.order?.returns?.edges ?? []).map((edge) => ({
    id: edge.node.id,
    name: edge.node.name ?? null,
    status: edge.node.status ?? null,
    trackingNumbers: (edge.node.reverseFulfillmentOrders?.edges ?? [])
      .flatMap((rfo) => rfo.node.reverseDeliveries?.edges ?? [])
      .map((delivery) => delivery.node.deliverable?.tracking?.number)
      .filter((number): number is string => Boolean(number)),
  }));
}

async function probeReturn(
  input: CreateReturnInput | CreateExchangeInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const orderGid = `gid://shopify/Order/${orderId}`;
  const variantId = optionalString(input.variant_id);
  const variantGid = variantId
    ? `gid://shopify/ProductVariant/${requireNumericId(variantId, "variant_id")}`
    : null;

  // createReturn does not reach returnCreate unless these items were returnable
  // a moment earlier, so their state now is what says whether the mutation
  // landed - and it is read with the tool's own query rather than a second one.
  const returnable = await fetchReturnableLineItems(ctx, orderGid);
  if (returnable === null) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }
  const stillReturnable = variantGid
    ? returnable.filter((item) => item.variantId === variantGid)
    : returnable;
  const open = (await fetchProbeReturns(ctx, orderGid))
    .filter((entry) => OPEN_RETURN_STATUSES.has(entry.status ?? ""));

  if (stillReturnable.length === 0 && open.length > 0) {
    // An open return that pre-dated the call cannot produce this reading: it
    // would have made these items unreturnable before the tool ever mutated,
    // and the tool would have stopped at "no returnable items".
    const label = open.length === 1 ? ` ${open[0]!.name ?? open[0]!.id}` : "";
    return committed(`Reconciled return${label} on order ${orderId}.`);
  }
  if (stillReturnable.length > 0 && open.length === 0) {
    // The one negative in this file that rests on a *positive* observation -
    // the items are still there to be returned - rather than on something not
    // being found, which is why it may conclude where probeReturnLabel below
    // may not.
    return noEffect(`Order ${orderId} has no open return and its requested items are still returnable.`);
  }
  return stillUnknown(
    `Order ${orderId} cannot be reconciled against the requested return: ${stillReturnable.length} returnable item(s) remain alongside ${open.length} open return(s).`,
  );
}

async function probeReturnLabel(
  input: AttachReturnLabelInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const trackingNumber = optionalString(input.tracking_number);
  // Shopify re-hosts the label it is handed, so `publicFileUrl` is never the
  // `label_url` that was requested and cannot identify this call's delivery. The
  // tracking number is the only field we send that comes back verbatim; without
  // one, a reverse delivery on the return is not attributable to this call.
  if (!trackingNumber) {
    return stillUnknown(
      `Return-label reconciliation for order ${orderId} needs a tracking number: Shopify does not echo the requested label URL back, so one reverse delivery cannot be told from another.`,
    );
  }

  const deliveries = (await fetchProbeReturns(ctx, `gid://shopify/Order/${orderId}`))
    .filter((entry) => OPEN_RETURN_STATUSES.has(entry.status ?? ""))
    .flatMap((entry) => entry.trackingNumbers);
  const matches = deliveries.filter((number) => number === trackingNumber);

  if (matches.length === 1) {
    return committed(`Reconciled return label with tracking ${trackingNumber} on order ${orderId}.`);
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple reverse deliveries on order ${orderId} carry tracking number ${trackingNumber}.`);
  }
  // Deliberately not no_effect. This is an absence, and every probe defect this
  // package has found was one: absence arrives through a read that may not yet
  // show the write, and clearing the action here invites a second label sent to
  // the customer. There is no positive counterpart to lean on the way probeReturn
  // has one, so it says so instead.
  return stillUnknown(
    `No reverse delivery carrying tracking number ${trackingNumber} was found on order ${orderId}. This does not prove the label was not attached — review the return before attaching another.`,
  );
}

async function probeFulfillment(
  input: FulfillOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const orderGid = `gid://shopify/Order/${orderId}`;
  const trackingNumber = optionalString(input.tracking_number);

  // fulfillOrder does not reach fulfillmentCreate unless something was
  // fulfillable a moment earlier, so what is fulfillable now is what says
  // whether the mutation landed - read with the tool's own query, not a copy.
  const fulfillable = await fetchFulfillableFulfillmentOrders(ctx, orderGid);
  if (fulfillable === null) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }

  if (trackingNumber) {
    const matches = (await fetchOrderFulfillmentTrackingNumbers(ctx, orderGid))
      .filter((number) => number === trackingNumber);
    if (matches.length === 1) {
      return committed(`Reconciled fulfillment with tracking ${trackingNumber} on order ${orderId}.`);
    }
    if (matches.length > 1) {
      return stillUnknown(`Multiple fulfillments on order ${orderId} carry tracking number ${trackingNumber}.`);
    }
    if (fulfillable.length > 0) {
      // Positive on both halves: no fulfillment carries this call's tracking
      // number, and the items it would have shipped are still awaiting
      // fulfillment. Neither alone would justify clearing the action.
      return noEffect(
        `Order ${orderId} has no fulfillment carrying tracking number ${trackingNumber} and its items are still awaiting fulfillment.`,
      );
    }
    // Something fulfilled this order, but not identifiably this call. Fulfilling
    // again would send the customer a second shipping notice.
    return stillUnknown(
      `Order ${orderId} has nothing left to fulfill, but no fulfillment carries tracking number ${trackingNumber}. Review the order before fulfilling again.`,
    );
  }

  if (fulfillable.length === 0) {
    // The tool stops at "nothing left to fulfill" before mutating, so this
    // reading cannot have pre-dated the call.
    return committed(`Reconciled fulfillment on order ${orderId}: nothing remains to fulfill.`);
  }
  return noEffect(`Order ${orderId} still has items awaiting fulfillment.`);
}

async function probeDiscount(
  input: IssueDiscountInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  if (!ctx.operationId) {
    return stillUnknown("Discount reconciliation requires a stable operation identity.");
  }
  const percentage = input.percentage;
  if (typeof percentage !== "number" || !Number.isFinite(percentage)) {
    return stillUnknown("Discount reconciliation requires the requested percentage.");
  }
  const code = discountCodeForOperation(percentage, ctx.operationId);
  const matches = await findDiscountsByCode(ctx, code);
  if (matches.length === 1) {
    return committed(`Reconciled discount code ${code}.`);
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple Shopify discounts use operation code ${code}.`);
  }
  // Even a direct read can be temporarily unavailable. Absence cannot safely
  // release the action because doing so invites a second customer-visible code.
  return stillUnknown(
    `No Shopify discount with operation code ${code} was found. This does not prove the discount was not created — review discounts before issuing another.`,
  );
}

type ReconciliationProbe = (
  input: unknown,
  ctx: ShopifyContext,
) => Promise<ShopifyReconciliationProbeResult>;

function defineReconciliationProbe<TInput>(
  tool: ToolName,
  probe: (input: TInput, ctx: ShopifyContext) => Promise<ShopifyReconciliationProbeResult>,
): ReconciliationProbe {
  return (input, ctx) => probe(parseToolInput(tool, input) as TInput, ctx);
}

const SHOPIFY_RECONCILIATION_PROBES = {
  create_refund: defineReconciliationProbe<CreateRefundInput>("create_refund", probeRefund),
  // Same probe: it matches on the order's refunds, and both refund tools refuse
  // an order that already has one, so exactly one refund can ever be in
  // question. The partial input carries no amount, which `probeRefund` reads as
  // "any successful refund on this order confirms it".
  create_partial_refund: defineReconciliationProbe<CreatePartialRefundInput>(
    "create_partial_refund",
    (input, ctx) => probeRefund({ order_id: input.order_id, amount: "" }, ctx),
  ),
  cancel_order: defineReconciliationProbe<CancelOrderInput>("cancel_order", probeCancellation),
  create_shopify_order: defineReconciliationProbe<CreateShopifyOrderInput>("create_shopify_order", probeCreatedOrder),
  create_gift_card: defineReconciliationProbe<CreateGiftCardInput>("create_gift_card", probeGiftCard),
  issue_store_credit: defineReconciliationProbe<IssueStoreCreditInput>("issue_store_credit", probeStoreCredit),
  edit_shopify_order: defineReconciliationProbe<EditShopifyOrderInput>("edit_shopify_order", probeOrderEdit),
  update_shopify_order_address: defineReconciliationProbe<UpdateShopifyOrderAddressInput>("update_shopify_order_address", probeOrderAddress),
  create_return: defineReconciliationProbe<CreateReturnInput>("create_return", probeReturn),
  create_exchange: defineReconciliationProbe<CreateExchangeInput>("create_exchange", probeReturn),
  attach_return_label: defineReconciliationProbe<AttachReturnLabelInput>("attach_return_label", probeReturnLabel),
  issue_discount: defineReconciliationProbe<IssueDiscountInput>("issue_discount", probeDiscount),
  fulfill_order: defineReconciliationProbe<FulfillOrderInput>("fulfill_order", probeFulfillment),
} satisfies Partial<Record<ToolName, ReconciliationProbe>>;

export const RECONCILABLE_SHOPIFY_MUTATION_TOOLS: ReadonlySet<string> = new Set(
  Object.keys(SHOPIFY_RECONCILIATION_PROBES),
);

export async function probeUnknownShopifyMutation(
  tool: string,
  input: unknown,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const probe = Object.prototype.hasOwnProperty.call(SHOPIFY_RECONCILIATION_PROBES, tool)
    ? SHOPIFY_RECONCILIATION_PROBES[tool as keyof typeof SHOPIFY_RECONCILIATION_PROBES]
    : undefined;
  if (!probe) {
    return stillUnknown(`Tool ${tool} does not have a Shopify reconciliation probe.`);
  }

  try {
    return await probe(input, ctx);
  } catch (error) {
    return stillUnknown(formatShopifyToolError(`${tool} reconciliation probe failed`, error));
  }
}
