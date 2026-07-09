import { noShopify, cancelReasons, requireShopify, returnReasons } from "./helpers.js";
import { arrayArg, booleanArg, defineTool, numberArg, stringArg } from "./schema.js";
import type {
  AttachReturnLabelInput,
  CancelOrderInput,
  CreateExchangeInput,
  CreateGiftCardInput,
  CreateRefundInput,
  CreateReturnInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
  GetShopifyOrdersInput,
  IssueDiscountInput,
  IssueStoreCreditInput,
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
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
    capabilities: ["shopify"],
    label: "Edited order",
    planStepLabel: "Edit existing order",
    execute: async (input: EditShopifyOrderInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.editShopifyOrder(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "issue_discount",
    description:
      "Issue a single-use percentage discount code as a goodwill gesture (a shipping delay, a minor complaint, a one-off apology). The code applies to the customer's NEXT order - it does NOT refund or change the current one. Prefer this over create_refund when the customer is staying and a small gesture resolves it; reach for a refund only when money must actually be returned. The percentage must be within the workspace discount cap. After issuing, always tell the customer the code in your reply.",
    fields: {
      percentage: numberArg("Whole-number percentage off the customer's next order, e.g. 10 for 10% off. Must be within the workspace discount cap.", { required: true }),
      reason: stringArg("Short internal reason for the gesture (e.g. 'shipping delay'). Used only to label the discount inside Shopify."),
      expires_in_days: numberArg("Optional whole number of days until the code expires. Omit for no expiry."),
    },
    category: "action",
    group: "order",
    capabilities: ["shopify"],
    label: "Issued discount code",
    planStepLabel: "Issue discount code",
    policy: {
      discountPercentLimit: true,
    },
    execute: async (input: IssueDiscountInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.issueDiscount(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "create_return",
    description:
      "Open a return (RMA) for items on a fulfilled Shopify order so the customer is authorized to send them back. This does NOT refund the customer or change the order total - it only creates the return; issue a refund separately with create_refund once the items are received, if a refund is owed. Use this when a customer wants to return what they got. By default it returns every returnable item on the order; pass variant_id (from the orders context) to return just that one item. Only works for items that have actually shipped.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric). Use the id field from the orders context.", { required: true }),
      variant_id: stringArg("Variant ID of the single item to return, from the orders context. Omit to return all returnable items on the order."),
      reason: stringArg("Why the item is coming back.", { enum: returnReasons }),
    },
    category: "action",
    group: "order",
    capabilities: ["shopify"],
    label: "Opened return",
    planStepLabel: "Open return",
    execute: async (input: CreateReturnInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.createReturn(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "create_exchange",
    description:
      "Set up an exchange on a fulfilled Shopify order: opens a return for the item the customer is sending back and records the replacement variant to ship once the return is processed. Use this instead of create_refund when the customer wants a different size, color, or variant and is keeping their money with the store. No money moves - the customer is not refunded or charged. Only works for items that have shipped; for unshipped orders use edit_shopify_order to swap items directly. The replacement must cost the same or less than the returned item - if it costs more, the customer would owe a balance, so escalate to the merchant instead of calling this.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric). Use the id field from the orders context.", { required: true }),
      variant_id: stringArg("Variant ID of the item the customer is sending back, from the orders context.", { required: true }),
      exchange_variant_id: stringArg("Variant ID of the replacement item to ship instead. Use search_shopify_products to find it if it is not in context.", { required: true }),
      quantity: numberArg("How many units to exchange. Defaults to 1."),
      reason: stringArg("Why the item is coming back.", { enum: returnReasons }),
    },
    category: "action",
    group: "order",
    capabilities: ["shopify"],
    label: "Set up exchange",
    planStepLabel: "Set up exchange",
    execute: async (input: CreateExchangeInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.createExchange(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "issue_store_credit",
    description:
      "Add store credit to the customer's account as a goodwill gesture that keeps the money with the store. The credit applies automatically at checkout when the customer is logged in - no code needed. Prefer this over create_refund when the customer is owed money back but is staying with the store; prefer issue_discount for minor inconveniences that don't owe money. The amount counts against the same workspace caps as refunds. Requires the store to have store credit enabled - if this tool fails saying store credit is unavailable, call create_gift_card for the same amount instead.",
    fields: {
      customer_id: stringArg("Shopify customer ID (numeric).", { required: true }),
      amount: stringArg("Amount of store credit in the store's currency (e.g. '25.00'). Must be within the workspace refund cap.", { required: true }),
      expires_in_days: numberArg("Optional whole number of days until the credit expires. Omit for no expiry."),
    },
    category: "action",
    group: "order",
    capabilities: ["shopify"],
    label: "Issued store credit",
    planStepLabel: "Issue store credit",
    policy: {
      refundAmountLimits: true,
      dailyRefundSpendLimit: true,
    },
    execute: async (input: IssueStoreCreditInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      if (!shopify) return noShopify;

      const credit = await deps.issueStoreCredit(input, shopify);
      if (credit.spentCents !== null && credit.spentCents > 0) {
        await deps.incrementDailyRefundSpendCents(ctx.orgId, credit.spentCents);
      }
      return credit;
    },
  }),
  defineTool({
    name: "create_gift_card",
    description:
      "Create a Shopify gift card as a goodwill gesture that keeps the money with the store. Always pass customer_id when known - Shopify then emails the gift card code to the customer, so your reply can say the code is on its way by email. Without customer_id the code is only shown once in the tool result and your reply MUST include it. Works for any store (unlike issue_store_credit, which needs store credit enabled). Prefer this or issue_store_credit over create_refund when the customer is owed money back but is staying with the store. The amount counts against the same workspace caps as refunds.",
    fields: {
      amount: stringArg("Gift card value in the store's currency (e.g. '25.00'). Must be within the workspace refund cap.", { required: true }),
      customer_id: stringArg("Shopify customer ID (numeric). Always provide it when known - Shopify emails the gift card code to this customer."),
      reason: stringArg("Short internal reason for the gesture (e.g. 'damaged item'). Used only as a note inside Shopify."),
      expires_in_days: numberArg("Optional whole number of days until the gift card expires. Omit for no expiry."),
    },
    category: "action",
    group: "order",
    capabilities: ["shopify"],
    label: "Created gift card",
    planStepLabel: "Create gift card",
    policy: {
      refundAmountLimits: true,
      dailyRefundSpendLimit: true,
    },
    execute: async (input: CreateGiftCardInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      if (!shopify) return noShopify;

      const giftCard = await deps.createGiftCard(input, shopify);
      if (giftCard.spentCents !== null && giftCard.spentCents > 0) {
        await deps.incrementDailyRefundSpendCents(ctx.orgId, giftCard.spentCents);
      }
      return giftCard;
    },
  }),
  defineTool({
    name: "attach_return_label",
    description:
      "Attach a return shipping label (a URL to the label file, e.g. a PDF) to the open return on a Shopify order, creating the reverse delivery. Use this after the merchant provides a label URL - typically as their answer to an ask_operator question. Requires an open return on the order: open one first with create_return or create_exchange. After attaching, your reply to the customer MUST include the label link so they can ship the items back.",
    fields: {
      order_id: stringArg("Shopify order ID (numeric) whose open return the label belongs to.", { required: true }),
      label_url: stringArg("Direct URL to the label file provided by the merchant.", { required: true }),
      tracking_number: stringArg("Tracking number for the return shipment, if the merchant provided one."),
    },
    category: "action",
    group: "order",
    capabilities: ["shopify"],
    label: "Attached return label",
    planStepLabel: "Attach return label",
    execute: async (input: AttachReturnLabelInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.attachReturnLabel(input, shopify) : noShopify;
    },
  }),
] as const;
