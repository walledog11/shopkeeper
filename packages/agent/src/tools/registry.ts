import type Anthropic from "@anthropic-ai/sdk";
import type { BaseAgentContext, SupportContext } from "../agent-context.js";
import { resolveAgentSettings } from "../settings.js";
import type { OrgSettings, ToolCategory } from "../types.js";
import { toolError, toolEscalated, toolNotFound, toolOk, type ToolResult } from "./result.js";

export interface SearchShopifyProductsInput {
  query: string;
  limit?: number;
}

export interface SearchShopifyCustomersInput {
  query: string;
  limit?: number;
}

export interface GetShopifyCustomerInput {
  customer_id: string;
}

export interface UpdateShopifyCustomerInfoInput {
  customer_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface GetShopifyOrdersInput {
  customer_id: string;
}

export interface UpdateShopifyOrderAddressInput {
  order_id: string;
  customer_id: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
}

export interface AddShopifyCustomerNoteInput {
  customer_id: string;
  note: string;
}

export interface GetOrderByNameInput {
  order_name: string;
}

export interface CreateRefundInput {
  order_id: string;
  amount: string;
  reason?: string;
}

export interface CancelOrderInput {
  order_id: string;
  reason?: "customer" | "fraud" | "inventory" | "declined" | "other";
  restock?: boolean;
}

export interface CreateShopifyOrderLineItem {
  variant_id?: string;
  title?: string;
  price?: string;
  quantity: number;
}

export interface CreateShopifyOrderInput {
  email: string;
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  line_items: CreateShopifyOrderLineItem[];
  note?: string;
}

export interface AddInternalNoteInput {
  text: string;
}

export interface SendReplyInput {
  text: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface UpdateThreadStatusInput {
  status: "open" | "pending" | "closed";
}

export interface UpdateThreadTagInput {
  tag: string;
}

export interface EscalateToHumanInput {
  reason: string;
}

export interface EditShopifyOrderInput {
  order_id: string;
  variant_id?: string;
  quantity?: number;
  remove_variant_id?: string;
}

export interface GetOrderTrackingInput {
  order_id: string;
}

export interface SearchKbInput {
  query: string;
}

export type ToolGroup =
  | "knowledge"
  | "product"
  | "customer"
  | "order"
  | "thread"
  | "messaging";

export interface RefundToolResult extends ToolResult {
  refundedCents: number | null;
}

export interface KnowledgeBaseToolArticle {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

interface ShopifyToolContext {
  shop: string;
  accessToken: string;
}

export interface ToolExecutionDeps {
  searchShopifyProducts(input: SearchShopifyProductsInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  searchShopifyCustomers(input: SearchShopifyCustomersInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getShopifyCustomer(input: GetShopifyCustomerInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  updateShopifyCustomerInfo(input: UpdateShopifyCustomerInfoInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getShopifyOrders(input: GetShopifyOrdersInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  updateShopifyOrderAddress(input: UpdateShopifyOrderAddressInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  addShopifyCustomerNote(input: AddShopifyCustomerNoteInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getOrderByName(input: GetOrderByNameInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getOrderTracking(input: GetOrderTrackingInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createRefund(input: CreateRefundInput, ctx: ShopifyToolContext): Promise<RefundToolResult>;
  cancelOrder(input: CancelOrderInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createShopifyOrder(
    input: CreateShopifyOrderInput,
    ctx: ShopifyToolContext,
    options: { allowCustomLineItems: boolean },
  ): Promise<ToolResult>;
  editShopifyOrder(input: EditShopifyOrderInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  incrementDailyRefundSpendCents(orgId: string, cents: number): Promise<unknown>;
  searchKnowledgeBaseArticles(orgId: string, words: readonly string[]): Promise<KnowledgeBaseToolArticle[]>;
  recordKnowledgeBaseCitations(orgId: string, threadId: string, articleIds: readonly string[]): Promise<unknown>;
}

export interface ToolPolicyMetadata {
  categoryPermission: boolean;
  refundAmountLimits?: boolean;
  dailyRefundSpendLimit?: boolean;
  cancellationDisabled?: boolean;
  customLineItemsDisabled?: boolean;
}

export type ToolParser<TInput> = (input: unknown) => TInput;

export interface AgentToolDefinition<TInput = unknown, TName extends string = string> {
  name: TName;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  parse: ToolParser<TInput>;
  category: ToolCategory;
  group: ToolGroup;
  labels: {
    executed: string;
    planStep: string;
  };
  policy: ToolPolicyMetadata;
  execute(
    input: TInput,
    ctx: BaseAgentContext,
    settings: OrgSettings,
    deps: ToolExecutionDeps,
  ): Promise<ToolResult>;
}

type FieldDefinition =
  | {
      kind: "string";
      description: string;
      required?: boolean;
      enum?: readonly string[];
    }
  | {
      kind: "number";
      description: string;
      required?: boolean;
    }
  | {
      kind: "boolean";
      description: string;
      required?: boolean;
    }
  | {
      kind: "array";
      description: string;
      required?: boolean;
      minItems?: number;
      items: FieldMap;
    };

type FieldMap = Record<string, FieldDefinition>;

interface DefineToolOptions<TInput, TName extends string> {
  name: TName;
  description: string;
  fields: FieldMap;
  category: ToolCategory;
  group: ToolGroup;
  label: string;
  planStepLabel: string;
  policy?: Partial<Omit<ToolPolicyMetadata, "categoryPermission">> & {
    categoryPermission?: boolean;
  };
  execute: AgentToolDefinition<TInput, TName>["execute"];
}

export class ToolInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputValidationError";
  }
}

function stringArg(
  description: string,
  options: { required?: boolean; enum?: readonly string[] } = {},
): FieldDefinition {
  return { kind: "string", description, ...options };
}

function numberArg(description: string, options: { required?: boolean } = {}): FieldDefinition {
  return { kind: "number", description, ...options };
}

function booleanArg(description: string, options: { required?: boolean } = {}): FieldDefinition {
  return { kind: "boolean", description, ...options };
}

function arrayArg(
  description: string,
  items: FieldMap,
  options: { required?: boolean; minItems?: number } = {},
): FieldDefinition {
  return { kind: "array", description, items, ...options };
}

function objectSchema(fields: FieldMap): Anthropic.Tool.InputSchema {
  const required = Object.entries(fields).flatMap(([name, field]) => (
    field.required ? [name] : []
  ));

  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [name, fieldSchema(field)])
    ),
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function fieldSchema(field: FieldDefinition): Record<string, unknown> {
  if (field.kind === "array") {
    return {
      type: "array",
      description: field.description,
      items: objectSchema(field.items),
      ...(field.minItems !== undefined ? { minItems: field.minItems } : {}),
    };
  }

  return {
    type: field.kind,
    description: field.description,
    ...(field.kind === "string" && field.enum ? { enum: field.enum } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationMessage(path: string, message: string): ToolInputValidationError {
  return new ToolInputValidationError(`${path} ${message}`);
}

function parseObject(fields: FieldMap, input: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw validationMessage(path, "must be an object.");
  }

  const allowedKeys = new Set(Object.keys(fields));
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw validationMessage(`${path}.${key}`, "is not allowed.");
    }
  }

  const parsed: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key];
    const fieldPath = `${path}.${key}`;
    if (value === undefined) {
      if (field.required) {
        throw validationMessage(fieldPath, "is required.");
      }
      continue;
    }
    parsed[key] = parseField(field, value, fieldPath);
  }

  return parsed;
}

function parseField(field: FieldDefinition, value: unknown, path: string): unknown {
  if (field.kind === "array") {
    if (!Array.isArray(value)) {
      throw validationMessage(path, "must be an array.");
    }
    if (field.minItems !== undefined && value.length < field.minItems) {
      throw validationMessage(path, `must include at least ${field.minItems} item.`);
    }
    return value.map((item, index) => parseObject(field.items, item, `${path}[${index}]`));
  }

  if (field.kind === "string") {
    if (typeof value !== "string") {
      throw validationMessage(path, "must be a string.");
    }
    if (field.enum && !field.enum.includes(value)) {
      throw validationMessage(path, `must be one of: ${field.enum.join(", ")}.`);
    }
    return value;
  }

  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw validationMessage(path, "must be a finite number.");
    }
    return value;
  }

  if (typeof value !== "boolean") {
    throw validationMessage(path, "must be a boolean.");
  }
  return value;
}

function objectParser<TInput>(fields: FieldMap): ToolParser<TInput> {
  return (input) => parseObject(fields, input, "input") as TInput;
}

function defineTool<const TName extends string, TInput>(
  definition: DefineToolOptions<TInput, TName>,
): AgentToolDefinition<TInput, TName> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: objectSchema(definition.fields),
    parse: objectParser<TInput>(definition.fields),
    category: definition.category,
    group: definition.group,
    labels: {
      executed: definition.label,
      planStep: definition.planStepLabel,
    },
    policy: {
      categoryPermission: true,
      ...definition.policy,
    },
    execute: definition.execute,
  };
}

function requireShopify(ctx: BaseAgentContext): ShopifyToolContext | null {
  return ctx.shopify;
}

function threadContextOf(
  ctx: BaseAgentContext,
): { threadId: string; orgId: string; orgName: string } | null {
  const thread = (ctx as Partial<SupportContext>).thread;
  if (!thread) return null;
  return { threadId: thread.id, orgId: ctx.orgId, orgName: ctx.orgName };
}

const noShopify = toolError("Error: no Shopify integration connected.");
const noThread = toolError("Error: this tool requires a conversation thread.");
const cancelReasons = ["customer", "fraud", "inventory", "declined", "other"] as const;
const threadStatuses = ["open", "pending", "closed"] as const;

export const TOOL_DEFINITIONS = [
  defineTool({
    name: "search_kb",
    description:
      "Search the organization's knowledge base for articles matching a query. Use this to find store policies, FAQs, or how-to guides before answering customer questions about returns, shipping, or store procedures.",
    fields: {
      query: stringArg("Search terms to look for in knowledge base article titles and bodies (e.g. 'return policy', 'shipping times').", { required: true }),
    },
    category: "read",
    group: "knowledge",
    label: "Searched knowledge base",
    planStepLabel: "Search knowledge base",
    execute: async (input: SearchKbInput, ctx, _settings, deps) => {
      const words = input.query.trim().split(/\s+/).filter((word) => word.length >= 2);
      if (words.length === 0) return toolNotFound("No knowledge base articles found for that query.");

      const articles = await deps.searchKnowledgeBaseArticles(ctx.orgId, words);
      if (articles.length === 0) return toolNotFound("No knowledge base articles found for that query.");

      const kbThreadCtx = threadContextOf(ctx);
      if (kbThreadCtx) {
        await deps.recordKnowledgeBaseCitations(ctx.orgId, kbThreadCtx.threadId, articles.map((article) => article.id));
      }

      return toolOk(JSON.stringify(articles.map((article) => ({
        title: article.title,
        body: article.body,
        tags: article.tags,
      }))));
    },
  }),
  defineTool({
    name: "search_shopify_products",
    description:
      "Search the Shopify product catalog by title or keyword. Returns matching products with their variants and variant IDs. Use this when the operator describes a product by name (e.g. 'pencil half zip, size L') so you can resolve the correct variant_id before creating an order.",
    fields: {
      query: stringArg("Product title or keyword to search for (e.g. 'pencil half zip').", { required: true }),
      limit: numberArg("Maximum number of products to return (default 5, max 10)."),
    },
    category: "read",
    group: "product",
    label: "Searched products",
    planStepLabel: "Search Shopify products",
    execute: async (input: SearchShopifyProductsInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.searchShopifyProducts(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "search_shopify_customers",
    description:
      "Search for Shopify customers by name or email. Use this when given a customer's name or email address to resolve their Shopify customer ID before calling other customer tools.",
    fields: {
      query: stringArg("Name or email to search for (e.g. 'Jane Smith' or 'jane@example.com').", { required: true }),
      limit: numberArg("Maximum number of results to return (default 5, max 10)."),
    },
    category: "read",
    group: "customer",
    label: "Searched customers",
    planStepLabel: "Search Shopify customers",
    execute: async (input: SearchShopifyCustomersInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.searchShopifyCustomers(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "get_shopify_customer",
    description:
      "Fetch the Shopify customer profile (name, email, phone, address, order count, total spent). Call this first whenever you need customer details.",
    fields: {
      customer_id: stringArg("The Shopify customer ID (already available in context if the thread is linked).", { required: true }),
    },
    category: "read",
    group: "customer",
    label: "Fetched customer",
    planStepLabel: "Fetch customer profile",
    execute: async (input: GetShopifyCustomerInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.getShopifyCustomer(input, shopify) : noShopify;
    },
  }),
  defineTool({
    name: "update_shopify_customer_info",
    description:
      "Update basic Shopify customer info: first name, last name, email, or phone.",
    fields: {
      customer_id: stringArg("Shopify customer ID.", { required: true }),
      first_name: stringArg("First name."),
      last_name: stringArg("Last name."),
      email: stringArg("Email address."),
      phone: stringArg("Phone number."),
    },
    category: "action",
    group: "customer",
    label: "Updated customer info",
    planStepLabel: "Update customer info on Shopify",
    execute: async (input: UpdateShopifyCustomerInfoInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.updateShopifyCustomerInfo(input, shopify) : noShopify;
    },
  }),
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
      "Update the shipping address on a specific Shopify order AND sync the customer's default address to match (only works for unfulfilled/unshipped orders). The order ID is available in the 'Customer's recent orders' context , use it directly. Pass ALL address components in a single call.",
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
    name: "add_shopify_customer_note",
    description: "Append a note to the Shopify customer record (visible in the Shopify admin).",
    fields: {
      customer_id: stringArg("Shopify customer ID.", { required: true }),
      note: stringArg("The note text to append.", { required: true }),
    },
    category: "action",
    group: "customer",
    label: "Added Shopify note",
    planStepLabel: "Add note to Shopify customer",
    execute: async (input: AddShopifyCustomerNoteInput, ctx, _settings, deps) => {
      const shopify = requireShopify(ctx);
      return shopify ? deps.addShopifyCustomerNote(input, shopify) : noShopify;
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
      "Create a new Shopify order on behalf of a customer. Each line item must include either a variant_id (for a real catalog product) or a title + price (for a custom item, if allowed). Set financial_status to pending , do not charge the customer.",
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
      remove_variant_id: stringArg("Variant ID of the existing item to remove. Use for removals and swaps. Available in the orders context , no search needed."),
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
  defineTool({
    name: "add_internal_note",
    description:
      "Add an internal note to the support thread. Notes are visible only to agents, not the customer. Always call this to document what you did.",
    fields: {
      text: stringArg("Note content.", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Added internal note",
    planStepLabel: "Add internal note",
    execute: async (input: AddInternalNoteInput, ctx) => (
      ctx.io ? ctx.io.addInternalNote(input) : noThread
    ),
  }),
  defineTool({
    name: "send_reply",
    description:
      "Send a message to the customer on their channel (Instagram DM, email, etc.).",
    fields: {
      text: stringArg("The message text to send.", { required: true }),
    },
    category: "communication",
    group: "messaging",
    label: "Sent reply",
    planStepLabel: "Notify customer",
    execute: async (input: SendReplyInput, ctx) => (
      ctx.io ? ctx.io.sendReply(input) : noThread
    ),
  }),
  defineTool({
    name: "send_email",
    description:
      "Send an outbound email to any email address. Use this to proactively contact a customer (e.g. shipping delay notice) even when the current thread is not an email thread.",
    fields: {
      to: stringArg("Recipient email address in user@domain format (e.g. 'jane@example.com'). Must be a valid SMTP address , never a name or phone number.", { required: true }),
      subject: stringArg("Email subject line.", { required: true }),
      body: stringArg("Email body text.", { required: true }),
    },
    category: "communication",
    group: "messaging",
    label: "Sent email",
    planStepLabel: "Send email to customer",
    execute: async (input: SendEmailInput, ctx) => (
      ctx.io ? ctx.io.sendEmail(input) : noThread
    ),
  }),
  defineTool({
    name: "update_thread_status",
    description: "Update the status of the support thread.",
    fields: {
      status: stringArg("New status for the thread.", { required: true, enum: threadStatuses }),
    },
    category: "internal",
    group: "thread",
    label: "Updated thread status",
    planStepLabel: "Update ticket status",
    execute: async (input: UpdateThreadStatusInput, ctx) => (
      ctx.io ? ctx.io.updateThreadStatus(input) : noThread
    ),
  }),
  defineTool({
    name: "update_thread_tag",
    description: "Update the topic tag on the support thread.",
    fields: {
      tag: stringArg("New tag (e.g. 'Shipping', 'Returns', 'Billing').", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Updated thread tag",
    planStepLabel: "Update ticket tag",
    execute: async (input: UpdateThreadTagInput, ctx) => (
      ctx.io ? ctx.io.updateThreadTag(input) : noThread
    ),
  }),
  defineTool({
    name: "escalate_to_human",
    description:
      "Hand off the ticket to the merchant when a tool failure, missing data, or out-of-scope question prevents you from helping. Marks the thread as pending with a 'needs_human' tag and logs the reason. Stop after calling this , do not attempt any other tools or send a reply.",
    fields: {
      reason: stringArg("A short explanation of why a human needs to take over (e.g. 'Customer is asking about wholesale pricing , out of scope', 'Shopify returned 503 on refund attempt').", { required: true }),
    },
    category: "internal",
    group: "thread",
    label: "Escalated to merchant",
    planStepLabel: "Escalate to merchant",
    execute: async (input: EscalateToHumanInput, ctx) => {
      const reason = input.reason.trim() || "No reason provided";
      await ctx.escalate(reason);
      return toolEscalated(reason);
    },
  }),
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export const TOOL_DEFINITION_REGISTRY: Record<string, AgentToolDefinition> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition])
);

const TOOL_GROUP_ORDER = ["knowledge", "product", "customer", "order", "thread", "messaging"] as const;

export const TOOL_CATEGORIES: Record<string, ToolCategory> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition.category])
);

export const TOOL_GROUPS: Record<ToolGroup, readonly string[]> = TOOL_GROUP_ORDER.reduce(
  (groups, group) => ({
    ...groups,
    [group]: TOOL_DEFINITIONS
      .filter((definition) => definition.group === group)
      .map((definition) => definition.name),
  }),
  {} as Record<ToolGroup, readonly string[]>,
);

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition.labels.executed])
);

export const PLAN_STEP_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition.labels.planStep])
);

export const AGENT_TOOLS: Anthropic.Tool[] = TOOL_DEFINITIONS.map((definition) => ({
  name: definition.name,
  description: definition.description,
  input_schema: definition.inputSchema,
}));

export function getToolDefinition(name: string): AgentToolDefinition | undefined {
  return TOOL_DEFINITION_REGISTRY[name];
}

export function isAgentToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_DEFINITION_REGISTRY, name);
}

export function parseToolInput(name: string, input: unknown): unknown {
  const definition = getToolDefinition(name);
  if (!definition) {
    throw new ToolInputValidationError(`unknown tool "${name}".`);
  }
  return definition.parse(input);
}

export function formatToolInputValidationError(name: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `invalid arguments for ${name}: ${message}`;
}

export function toolNamesForGroups(...groups: ToolGroup[]): string[] {
  return groups.flatMap((group) => [...TOOL_GROUPS[group]]);
}

export function selectAgentTools(
  settings?: OrgSettings,
  allowedToolNames?: readonly string[] | null,
): Anthropic.Tool[] {
  const s = resolveAgentSettings(settings);
  const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
  return AGENT_TOOLS.filter((tool) => {
    const category = TOOL_CATEGORIES[tool.name];
    if (category && !s.toolsEnabled[category]) return false;
    if (allowed && !allowed.has(tool.name)) return false;
    return true;
  });
}
