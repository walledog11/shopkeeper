import { noShopify, cancelReasons, requireShopify } from "./helpers.js";
import { arrayArg, booleanArg, defineTool, numberArg, stringArg } from "./schema.js";
import type {
  CancelOrderInput,
  CreateRefundInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
} from "./types.js";

export const ORDER_TOOL_DEFINITIONS = [
  defineTool({
    name: "get_shopify_orders",
    description:
      "Fetch the most recent Shopify orders for a customer (up to 5), including financial status, fulfillment status, line items, and the order's shipping_address (address1, address2, city, province, zip, country). Use this first for basic order-status questions or to look up the shipping address; if fulfillment_status is null, the order has not shipped yet and you usually do not need get_order_tracking.",
    fields: {
      customer_id: stringArg("Shopify customer ID.", { required: true }),
    },
    category: "read",
    group: "order",
    label: "Fetched orders",
    planStepLabel: "Fetch recent orders",
    execute: async (input: GetShopifyOrdersInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getShopifyOrders(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "update_shopify_order_address",
    description:
      "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). The order ID is available in the 'Customer's recent orders' context — use it directly. Pass ALL address components in a single call.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", { required: true }),
      customer_id: stringArg("Shopify customer ID.", { required: true }),
      address1: stringArg("Street line (e.g. '123 Main St').", { required: true }),
      address2: stringArg("Apartment, suite, unit, etc. (e.g. 'Apt 4B'). Omit if not provided."),
      city: stringArg("City.", { required: true }),
      province: stringArg("State or province abbreviation (e.g. 'NY', 'CA').", { required: true }),
      zip: stringArg("ZIP or postal code.", { required: true }),
      country: stringArg("Country name (e.g. 'United States').", { required: true }),
    },
    category: "action",
    group: "order",
    label: "Updated shipping address",
    planStepLabel: "Update shipping address on Shopify",
    execute: async (input: UpdateShopifyOrderAddressInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.updateShopifyOrderAddress(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "get_order_by_name",
    description:
      "Look up a Shopify order by its human-readable order number (e.g. '#1234'). Use this when the customer mentions an order number. Returns the order ID, financial/fulfillment status, line items, and shipping_address.",
    fields: {
      order_name: stringArg("The order number as shown to the customer, e.g. '#1234' or '1234'.", { required: true }),
    },
    category: "read",
    group: "order",
    label: "Looked up order",
    planStepLabel: "Look up order",
    execute: async (input: GetOrderByNameInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getOrderByName(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "get_order_tracking",
    description:
      "Fetch live fulfillment and tracking details for a Shopify order. Returns tracking number, carrier, shipment status, estimated delivery date, and the full scan event timeline (including exceptions like return to sender, delivery attempt failed, weather delay, etc.). Use this only when an order is already fulfilled or partially fulfilled, or when someone explicitly needs tracking details such as tracking numbers, carrier scans, delivery events, or delivery exceptions. Do not use it for unfulfilled orders or basic status checks that can be answered from get_shopify_orders.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context or from get_order_by_name.", { required: true }),
    },
    category: "read",
    group: "order",
    label: "Fetched tracking info",
    planStepLabel: "Fetch order tracking",
    execute: async (input: GetOrderTrackingInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getOrderTracking(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "create_refund",
    description:
      "Issue a refund on a Shopify order. Always pass an explicit amount (for a full refund, use the order's total from the orders context) so the refund can be validated against the workspace refund limit.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric).", { required: true }),
      amount: stringArg("Amount to refund in the store's currency (e.g. '19.99'). For a full refund, use the order's total from context. Always provide this.", { required: true }),
      reason: stringArg("Reason for the refund (e.g. 'Item not received', 'Wrong item sent')."),
    },
    category: "action",
    group: "order",
    label: "Issued refund",
    planStepLabel: "Issue refund",
    policy: {
      refundAmountLimits: true,
      dailyRefundSpendLimit: true,
    },
    execute: async (input: CreateRefundInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      if (!shopify) return noShopify;

      const refund = await deps.createRefund(input, shopify);
      if (refund.refundedCents !== null && refund.refundedCents > 0) {
        await deps.incrementDailyRefundSpendCents(ctx.orgId, refund.refundedCents);
      }
      return refund;
    },
  }),
  defineTool({
    name: "cancel_order",
    description:
      "Cancel an unfulfilled Shopify order. Only works for orders that have not yet been fulfilled.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric).", { required: true }),
      reason: stringArg("Reason for cancellation.", { enum: cancelReasons }),
      restock: booleanArg("Whether to restock the items. Defaults to true."),
    },
    category: "action",
    group: "order",
    label: "Cancelled order",
    planStepLabel: "Cancel order",
    policy: {
      cancellationDisabled: true,
    },
    execute: async (input: CancelOrderInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.cancelOrder(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "create_shopify_order",
    description:
      "Create a new Shopify order on behalf of a customer. Each line item must include either a variant_id (for a real catalog product) or a title + price (for a custom item, if allowed). Set financial_status to pending — do not charge the customer.",
    fields: {
      email: stringArg("Customer email address.", { required: true }),
      first_name: stringArg("Customer first name.", { required: true }),
      last_name: stringArg("Customer last name.", { required: true }),
      address1: stringArg("Shipping street address.", { required: true }),
      address2: stringArg("Apartment or suite (optional)."),
      city: stringArg("City.", { required: true }),
      province: stringArg("State or province abbreviation (e.g. 'NY').", { required: true }),
      zip: stringArg("ZIP or postal code.", { required: true }),
      country: stringArg("Country name (e.g. 'United States').", { required: true }),
      line_items: arrayArg(
        "Items to include in the order.",
        {
          variant_id: stringArg("Shopify product variant ID. Use this for real catalog products."),
          title: stringArg("Custom item title. Only provide when variant_id is omitted."),
          price: stringArg("Unit price as a decimal string (e.g. '29.99'). Only for custom items."),
          quantity: numberArg("Quantity.", { required: true }),
        },
        { required: true, minItems: 1 },
      ),
      note: stringArg("Optional note to attach to the order."),
    },
    category: "action",
    group: "order",
    label: "Created order",
    planStepLabel: "Create Shopify order",
    policy: {
      customLineItemsDisabled: true,
    },
    execute: async (input: CreateShopifyOrderInput, ctx, settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify
        ? deps.createShopifyOrder(input, shopify, {
            allowCustomLineItems: !settings.blockCustomLineItems,
          })
        : noShopify;
    },
  }),
  defineTool({
    name: "edit_shopify_order",
    description:
      "Add, remove, or swap a line item on an existing Shopify order using the Order Editing API. To add an item: provide variant_id and quantity. To remove an item: provide only remove_variant_id from the orders context, no search needed. To swap size/color: provide variant_id (new) and remove_variant_id (old). At least one of variant_id or remove_variant_id must be provided.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", { required: true }),
      variant_id: stringArg("Variant ID to add. Required when adding or swapping. Omit for pure removal."),
      quantity: numberArg("Number of units to add. Required when variant_id is provided."),
      remove_variant_id: stringArg("Variant ID of the existing item to remove. Use for removals and swaps. Available in the orders context — no search needed."),
    },
    category: "action",
    group: "order",
    label: "Edited order",
    planStepLabel: "Edit existing order",
    execute: async (input: EditShopifyOrderInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.editShopifyOrder(input, shopify) : noShopify;
    },
  }),
] as const;
