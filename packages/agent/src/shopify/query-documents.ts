// Every GraphQL query document this package sends, in one enumerable place.
//
// The mutation counterpart (mutation-documents.ts) exists because two mutation
// documents shipped statically invalid and were rejected by Shopify 100% of the
// time. This registry exists because that guard covered only mutations, and the
// next two defects of the same class were in a *query*:
// `returnableFulfillments` was asked for as a field on `Order`, which the
// 2026-04 schema no longer has, so `create_return` and `create_exchange` both
// died in the read that gates their mutation. A broken read kills a capability
// exactly as dead as a broken write, and `--validate` reported 12/12 green the
// whole time.
//
// Queries are cheaper to check than mutations: a read against a nonexistent id
// commits nothing, so there is no @skip trick to apply and no development-plan
// store required. The document either validates or it does not.
//
// As with mutations, the documents live in the modules that send them - these
// are the same constants, not copies - so validating one of these validates the
// string that actually runs.
import { VARIANT_PRICES_QUERY } from "./exchanges.js";
import { DISCOUNT_CODES_BY_CODE_QUERY } from "./discounts.js";
import {
  ORDER_FULFILLMENTS_TRACKING_QUERY,
  ORDER_FULFILLMENT_ORDERS_QUERY,
} from "./fulfillment.js";
import { CREATED_ORDER_LOOKUP_QUERY } from "./order-creation.js";
import { PRODUCT_SEARCH_QUERY } from "./products.js";
import { INVENTORY_STATUS_QUERY } from "./inventory.js";
import { AUTOMATIC_DISCOUNTS_QUERY } from "./flash-sales.js";
import { VARIANT_PRODUCT_QUERY } from "./variant-pricing.js";
import {
  CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY,
  GIFT_CARDS_BY_CODE_QUERY,
  RECENT_GIFT_CARDS_QUERY,
  RETURN_RECONCILIATION_QUERY,
} from "./reconciliation-probes/index.js";
import { ORDER_RETURNS_QUERY } from "./return-labels.js";
import { ORDER_RETURN_STATUSES_QUERY } from "./return-status.js";
import { RETURNABLE_FULFILLMENTS_QUERY } from "./returns.js";
import { SHOP_CURRENCY_QUERY } from "./store-credit.js";

export interface ShopifyQueryDocument {
  document: string;
  // Variables that make the document coercible while reaching nothing real.
  // Every id points at a resource that does not exist, so a validated query
  // returns nulls or empty connections rather than data.
  variables: Record<string, unknown>;
}

export const SHOPIFY_QUERY_DOCUMENTS: Record<string, ShopifyQueryDocument> = {
  discountCodesByCode: {
    document: DISCOUNT_CODES_BY_CODE_QUERY,
    variables: { code: "SHOPKEEPER-VALIDATION" },
  },
  variantPrices: {
    document: VARIANT_PRICES_QUERY,
    variables: { ids: ["gid://shopify/ProductVariant/1"] },
  },
  createdOrderLookup: {
    document: CREATED_ORDER_LOOKUP_QUERY,
    variables: { query: "tag:shopkeeper-op-validation" },
  },
  giftCardsByCode: {
    document: GIFT_CARDS_BY_CODE_QUERY,
    variables: { query: "code:shopkeeper-validation" },
  },
  recentGiftCards: {
    document: RECENT_GIFT_CARDS_QUERY,
    variables: {},
  },
  customerStoreCreditTransactions: {
    document: CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY,
    variables: { id: "gid://shopify/Customer/1" },
  },
  returnReconciliation: {
    document: RETURN_RECONCILIATION_QUERY,
    variables: { id: "gid://shopify/Order/1" },
  },
  orderReturns: {
    document: ORDER_RETURNS_QUERY,
    variables: { id: "gid://shopify/Order/1" },
  },
  orderReturnStatuses: {
    document: ORDER_RETURN_STATUSES_QUERY,
    variables: { id: "gid://shopify/Order/1" },
  },
  returnableFulfillments: {
    document: RETURNABLE_FULFILLMENTS_QUERY,
    variables: { orderId: "gid://shopify/Order/1" },
  },
  orderFulfillmentOrders: {
    document: ORDER_FULFILLMENT_ORDERS_QUERY,
    variables: { id: "gid://shopify/Order/1" },
  },
  orderFulfillmentsTracking: {
    document: ORDER_FULFILLMENTS_TRACKING_QUERY,
    variables: { id: "gid://shopify/Order/1" },
  },
  shopCurrency: {
    document: SHOP_CURRENCY_QUERY,
    variables: {},
  },
  productSearch: {
    document: PRODUCT_SEARCH_QUERY,
    variables: { query: "shopkeeper-validation", first: 1 },
  },
  inventoryStatus: {
    document: INVENTORY_STATUS_QUERY,
    variables: { query: "shopkeeper-validation", first: 1 },
  },
  flashSales: {
    document: AUTOMATIC_DISCOUNTS_QUERY,
    variables: { first: 1 },
  },
  variantProducts: {
    document: VARIANT_PRODUCT_QUERY,
    variables: { ids: ["gid://shopify/ProductVariant/1"] },
  },
};
