import { SUPPORT_STATS_DEFAULT_DAYS, SUPPORT_STATS_MAX_DAYS } from "../support-stats-types.js";
import { blankAnswerField, MERCHANT_ANSWER_NAMES } from "../../reply-placeholders.js";
import { arrayArg, booleanArg, numberArg, stringArg, type FieldMap, type InputFromFields } from "./fields.js";

export const APPROVAL_LINE_ITEM_CHANGES = ["refund", "return", "replacement", "remove", "add"] as const;
const cancelReasons = ["customer", "fraud", "inventory", "declined", "other"] as const;
const returnReasons = [
  "unwanted",
  "defective",
  "wrong_item",
  "not_as_described",
  "too_large",
  "too_small",
  "style",
  "color",
  "other",
] as const;
// Escalation is orthogonal (`Thread.escalatedAt`); `pending` remains a legacy
// database value but is no longer a state the model may create.
const threadStatuses = ["open", "closed"] as const;

// Hidden from the model; the planner binds it from Shopify before approval.
const approvalLineItemsArg = arrayArg(
  "The line items this write targets, as Shopify names them, bound by the runtime for approval.",
  {
    name: stringArg("Shopify's name for the line item or variant.", { required: true }),
    quantity: numberArg("How many units the write changes.", { required: true }),
    change: stringArg("What the write does to it.", { required: true, enum: APPROVAL_LINE_ITEM_CHANGES }),
  },
  { runtimeOnly: true },
);

// Every customer message the agent writes is one of these two fields, so the
// shop's voice is set here once for every mode that drafts one.
const CUSTOMER_MESSAGE_TEXT =
  "Exactly what they read. Write it the way a person at the shop would: warm, plain, short sentences, no em dashes (—), bullet characters or markdown. Never describe their photos or attachments back to them. Order and tracking numbers are the only store references to mention; leave out internal ones such as a return's.";

// A blank's saved answer, bound on the message by planning so the card shows it
// and the approval binds it. Never offered to the model: only the store's own
// answer fills a blank.
const BLANK_ANSWER_FIELDS = Object.fromEntries(MERCHANT_ANSWER_NAMES.map((name) => [
  blankAnswerField(name),
  stringArg("Runtime-supplied: the store's saved answer for this blank, bound for approval.", { runtimeOnly: true }),
]));

// What an email to a customer is made of. The operator's draft_email parks
// exactly this input as the send_email the merchant approves, so the two read
// and validate it the same way.
export const SEND_EMAIL_FIELDS = {
  to: stringArg("Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address — never a name or phone number.", { required: true, nonBlank: true }),
  subject: stringArg("Email subject line.", { required: true, nonBlank: true }),
  body: stringArg(CUSTOMER_MESSAGE_TEXT, { required: true, nonBlank: true }),
  ...BLANK_ANSWER_FIELDS,
};

/** One contract for model JSON schemas, runtime parsing, and TypeScript inputs. */
export const TOOL_INPUT_FIELDS = {
  search_kb: {
    query: stringArg("Search terms to look for in knowledge base article titles and bodies (e.g. 'return policy', 'shipping times').", { required: true }),
  },
  search_shopify_products: {
    query: stringArg("Product title or keyword to search for (e.g. 'pencil half zip').", { required: true }),
    limit: numberArg("Maximum number of products to return (default 5, max 10)."),
  },
  get_inventory_status: {
    query: stringArg("Product title or keyword. Omit to list low-stock items instead."),
    limit: numberArg("Maximum number of products to return when querying (default 5, max 10)."),
    low_stock_threshold: numberArg("Units at or below which an item counts as low (default 5). Only used when no query is given."),
  },
  find_customer: {
    by: stringArg(
      "How you are identifying the customer: 'query' for a name or email, 'id' for a Shopify customer ID.",
      { required: true, enum: ["query", "id"] },
    ),
    value: stringArg(
      "The name or email when by='query' (e.g. 'Jane Smith' or 'jane@example.com'), or the Shopify customer ID when by='id'.",
      { required: true },
    ),
    limit: numberArg("Maximum matches to return for by='query' (default 5, max 10). Ignored for by='id'."),
  },
  search_shopify_customers: {
    query: stringArg("Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').", { required: true }),
    limit: numberArg("Maximum number of results to return (default 5, max 10)."),
  },
  get_shopify_customer: {
    customer_id: stringArg("The Shopify customer ID (already available in context if the thread is linked).", { required: true }),
  },
  update_shopify_customer_info: {
    customer_id: stringArg("Shopify customer ID.", { required: true }),
    first_name: stringArg("First name."),
    last_name: stringArg("Last name."),
    email: stringArg("Email address."),
    phone: stringArg("Phone number."),
  },
  add_shopify_customer_note: {
    customer_id: stringArg("Shopify customer ID.", { required: true }),
    note: stringArg("The note text to append.", { required: true }),
  },
  get_shopify_orders: {
    customer_id: stringArg("Shopify customer ID.", { required: true }),
  },
  update_shopify_order_address: {
    order_id: stringArg("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", { required: true }),
    customer_id: stringArg("Shopify customer ID.", { required: true }),
    address1: stringArg("Street line (e.g. '123 Main St').", { required: true }),
    address2: stringArg("Apartment, suite, unit, etc. (e.g. 'Apt 4B'). Omit if not provided."),
    city: stringArg("City.", { required: true }),
    province: stringArg("State or province abbreviation (e.g. 'NY', 'CA').", { required: true }),
    zip: stringArg("ZIP or postal code.", { required: true }),
    country: stringArg("Country name (e.g. 'United States').", { required: true }),
  },
  get_order_by_name: {
    order_name: stringArg("The order number as shown to the customer, e.g. '#1234' or '1234'.", { required: true }),
  },
  get_order_fulfillment_status: {
    order_number: stringArg("The order number as shown to the customer, e.g. '#1234' or '1234'."),
    email: stringArg("The email address used at checkout, if they gave one. Supplying both narrows the match."),
  },
  get_order_tracking: {
    order_id: stringArg("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context or from get_order_by_name.", { required: true }),
  },
  create_refund: {
    order_id: stringArg("Shopify order ID (numeric).", { required: true }),
    amount: stringArg("Runtime-supplied Shopify quote for approval. Always omit this field."),
    currency: stringArg("Runtime-supplied quote currency for approval. Always omit this field."),
    approval_shop_amount: stringArg("Runtime-supplied cost of the refund in the shop's currency, for approval.", { runtimeOnly: true }),
    reason: stringArg("Reason for the refund (e.g. 'Item not received', 'Wrong item sent')."),
  },
  create_partial_refund: {
    order_id: stringArg("Shopify order ID (numeric).", { required: true }),
    items: arrayArg(
      "The line items to refund and how many units of each.",
      {
        line_item_id: stringArg("Shopify line item ID from the order.", { required: true }),
        quantity: numberArg("How many units of this line item to refund.", { required: true }),
      },
      { required: true, minItems: 1 },
    ),
    reason: stringArg("Reason for the refund (e.g. 'One napkin arrived torn')."),
    approval_amount: stringArg("Runtime-supplied Shopify quote for approval. Always omit this field."),
    approval_currency: stringArg("Runtime-supplied quote currency for approval. Always omit this field."),
    approval_line_items: approvalLineItemsArg,
  },
  cancel_order: {
    order_id: stringArg("Shopify order ID (numeric).", { required: true }),
    reason: stringArg("Reason for cancellation.", { enum: cancelReasons }),
    restock: booleanArg("Whether to restock the items. Defaults to true."),
    approval_amount: stringArg("Runtime-supplied Shopify quote of the refund, for approval.", { runtimeOnly: true }),
    approval_currency: stringArg("Runtime-supplied quote currency, for approval.", { runtimeOnly: true }),
  },
  create_shopify_order: {
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
    payment: stringArg('Who pays for the order: "customer_pays" when the customer owes its total, or "free" when it should cost them nothing, such as a free replacement or a gift.', { modelRequired: true, enum: ["customer_pays", "free"] }),
  },
  edit_shopify_order: {
    order_id: stringArg("Shopify order ID (numeric, e.g. '5678901234'). Use the id field from the orders context.", { required: true }),
    variant_id: stringArg("Variant ID to add. Required when adding or swapping. Omit for pure removal."),
    quantity: numberArg("Number of units to add. Required when variant_id is provided."),
    remove_variant_id: stringArg("Variant ID of the existing item to remove. Use for removals and swaps. Available in the orders context — no search needed."),
    approval_line_items: approvalLineItemsArg,
  },
  issue_discount: {
    percentage: numberArg("Whole-number percentage off the customer's next order, e.g. 10 for 10% off. Must be within the workspace discount cap.", { required: true }),
    reason: stringArg("Short internal reason for the gesture (e.g. 'shipping delay'). Used only to label the discount inside Shopify."),
    expires_in_days: numberArg("Optional whole number of days until the code expires. Omit for no expiry."),
  },
  create_return: {
    order_id: stringArg("Shopify order ID (numeric). Use the id field from the orders context.", { required: true }),
    variant_id: stringArg("Variant ID of the single item to return, from the orders context. Omit to return all returnable items on the order."),
    reason: stringArg("Why the item is coming back.", { enum: returnReasons }),
    approval_line_items: approvalLineItemsArg,
  },
  create_exchange: {
    order_id: stringArg("Shopify order ID (numeric). Use the id field from the orders context.", { required: true }),
    variant_id: stringArg("Variant ID of the item the customer is sending back, from the orders context.", { required: true }),
    exchange_variant_id: stringArg("Variant ID of the replacement item to record on the exchange. Use search_shopify_products to find it if it is not in context.", { required: true }),
    quantity: numberArg("How many units to exchange. Defaults to 1."),
    reason: stringArg("Why the item is coming back.", { enum: returnReasons }),
    approval_line_items: approvalLineItemsArg,
  },
  get_exchange_quote: {
    order_id: stringArg("Shopify order ID.", { required: true }),
    variant_id: stringArg("Variant ID of the fulfilled item being returned.", { required: true }),
    exchange_variant_id: stringArg("Variant ID of the selected replacement.", { required: true }),
    quantity: numberArg("How many units to exchange. Defaults to 1."),
  },
  issue_store_credit: {
    customer_id: stringArg("Shopify customer ID (numeric).", { required: true }),
    amount: stringArg("Amount of store credit in the store's currency (e.g. '25.00'). Must be within the workspace refund cap.", { required: true }),
    expires_in_days: numberArg("Optional whole number of days until the credit expires. Omit for no expiry."),
  },
  create_gift_card: {
    amount: stringArg("Gift card value in the store's currency (e.g. '25.00'). Must be within the workspace compensation limit.", { required: true }),
    customer_id: stringArg("Resolved Shopify customer ID (numeric). Required so Shopify delivers the gift card code to this customer.", { required: true }),
    reason: stringArg("Short internal reason for the gesture (e.g. 'damaged item'). Used only as a note inside Shopify."),
    expires_in_days: numberArg("Optional whole number of days until the gift card expires. Omit for no expiry."),
  },
  attach_return_label: {
    order_id: stringArg("Shopify order ID (numeric) whose open return the label belongs to.", { required: true }),
    label_url: stringArg("Direct URL to the label file provided by the merchant.", { required: true }),
    tracking_number: stringArg("Tracking number for the return shipment, if the merchant provided one."),
  },
  fulfill_order: {
    order_id: stringArg("Shopify order ID (numeric). Use the id field from the orders context.", { required: true }),
    tracking_number: stringArg("Carrier tracking number for the shipment, if the merchant provided one."),
    tracking_company: stringArg("Carrier name (e.g. 'USPS', 'UPS', 'FedEx'). Provide it whenever a tracking number is given so the customer's tracking link resolves."),
    tracking_url: stringArg("Direct tracking URL, if the merchant provided one instead of or alongside a number."),
    notify_customer: booleanArg("Whether Shopify emails the customer a shipping confirmation. Defaults to true."),
  },
  add_internal_note: {
    text: stringArg("Note content.", { required: true }),
  },
  update_thread_status: {
    status: stringArg("New status for the thread.", { required: true, enum: threadStatuses }),
  },
  update_thread_tag: {
    tag: stringArg("New tag (e.g. 'Shipping', 'Returns', 'Billing').", { required: true }),
  },
  await_customer_photo: {},
  await_order_verification: {
    order_name: stringArg("The order number they named, e.g. #1043. Leave it out while you are asking which order."),
  },
  escalate_to_human: {
    reason: stringArg("A short explanation of WHY you cannot finish this yourself — the blocker, not the customer's story. Whoever reads this already has a summary of what the customer asked immediately above it, so restating the situation prints the same fact twice; add only what that summary does not already say. Good: 'Shopify returned 503 on the refund attempt', 'Refund is above the approval cap', 'Wholesale pricing — out of scope'. Bad: 'The customer received a damaged snowboard and is requesting a refund on order #1024'.", { required: true }),
  },
  ask_operator: {
    question: stringArg("The specific question for the merchant, phrased so a one-line answer unblocks the ticket (e.g. 'Do we ship to Canada, and at what rate?').", { required: true }),
  },
  send_reply: {
    text: stringArg(CUSTOMER_MESSAGE_TEXT, { required: true, nonBlank: true }),
    await_response: booleanArg("Retired; parked replies may still carry it.", { retired: true }),
    promises_follow_up: booleanArg("Set true when this reply tells the customer that you or anyone at the store will do something later, such as look into it, pass it along, or get back to them. Nothing does that work on its own, so the merchant approves the reply before it is sent."),
    ...BLANK_ANSWER_FIELDS,
  },
  send_email: SEND_EMAIL_FIELDS,
  get_support_stats: {
    days: numberArg(`Number of days to look back (1-${SUPPORT_STATS_MAX_DAYS}). Use ${SUPPORT_STATS_DEFAULT_DAYS} for 'this week', 30 for 'this month'.`, { required: true }),
  },
} as const satisfies Record<string, FieldMap>;

export type ToolInput<Name extends keyof typeof TOOL_INPUT_FIELDS> = InputFromFields<typeof TOOL_INPUT_FIELDS[Name]>;
