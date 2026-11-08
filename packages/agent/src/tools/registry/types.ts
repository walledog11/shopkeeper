import type { ToolInput } from "./input-fields.js";
import type Anthropic from "@anthropic-ai/sdk";
import type { RecordReturnWatchParams } from "@shopkeeper/db";
import type { BaseAgentContext, TaskModelBudget } from "../../agent-context.js";
import type { OrgSettings, ToolCategory } from "../../types.js";
import type { ShopifyOAuthScope } from "../../shopify/integration-health.js";
import type { ToolResult } from "../result.js";
import type { SupportStatsSummary } from "../support-stats-types.js";

export type SearchShopifyProductsInput = ToolInput<"search_shopify_products">;

// One lookup, discriminated by how the caller knows the customer. `query`
// resolves a name or email to an ID and returns the thin match list; `id`
// returns the full profile. Two tools for two ways of naming the same record
// meant the model chose between them before it could ask anything.
export type FindCustomerInput = ToolInput<"find_customer">;

export type UpdateShopifyCustomerInfoInput = ToolInput<"update_shopify_customer_info">;

export type GetShopifyOrdersInput = ToolInput<"get_shopify_orders">;

export type UpdateShopifyOrderAddressInput = ToolInput<"update_shopify_order_address">;

export type AddShopifyCustomerNoteInput = ToolInput<"add_shopify_customer_note">;

export type GetOrderByNameInput = ToolInput<"get_order_by_name">;

export type GetOrderFulfillmentStatusInput = ToolInput<"get_order_fulfillment_status">;

export type CreateRefundInput = ToolInput<"create_refund">;

export { APPROVAL_LINE_ITEM_CHANGES } from "./input-fields.js";

/**
 * A line item a write targets, named by Shopify and bound into the proposal
 * before approval so the card can say which item the IDs point at. Display
 * only: execution acts on the IDs and never reads it.
 */
export type ApprovalLineItem = NonNullable<CreatePartialRefundInput["approval_line_items"]>[number];

/** Item and quantity selection. Approval fields are runtime-authored. */
export type CreatePartialRefundInput = ToolInput<"create_partial_refund">;

export type CancelOrderInput = ToolInput<"cancel_order">;

export type CreateShopifyOrderLineItem = CreateShopifyOrderInput["line_items"][number];

export type CreateShopifyOrderInput = ToolInput<"create_shopify_order">;

export type AddInternalNoteInput = ToolInput<"add_internal_note">;

export type SendReplyInput = ToolInput<"send_reply">;

export type SendEmailInput = ToolInput<"send_email">;

export type UpdateThreadStatusInput = ToolInput<"update_thread_status">;

export type UpdateThreadTagInput = ToolInput<"update_thread_tag">;

/** Takes no input: the runtime records which thread is waiting and since when. */
export type AwaitCustomerPhotoInput = ToolInput<"await_customer_photo">;

/** Names the order only. The email or zip is never an input: code reads it from the customer's message. */
export type AwaitOrderVerificationInput = ToolInput<"await_order_verification">;

export type EscalateToHumanInput = ToolInput<"escalate_to_human">;

export type AskOperatorInput = ToolInput<"ask_operator">;

export type EditShopifyOrderInput = ToolInput<"edit_shopify_order">;

export type IssueDiscountInput = ToolInput<"issue_discount">;

export type CreateReturnInput = ToolInput<"create_return">;

export type IssueStoreCreditInput = ToolInput<"issue_store_credit">;

export type CreateGiftCardInput = ToolInput<"create_gift_card">;

export type ExchangeQuoteInput = ToolInput<"get_exchange_quote">;

export type CreateExchangeInput = ToolInput<"create_exchange">;

export type AttachReturnLabelInput = ToolInput<"attach_return_label">;

export type FulfillOrderInput = ToolInput<"fulfill_order">;

export type GetOrderTrackingInput = ToolInput<"get_order_tracking">;

/**
 * Two questions with one answer shape. With `query`, stock for what matches it;
 * without, everything at or below the low-stock threshold. Omitting `query` is
 * the merchant asking "what am I running out of", not a wildcard over the
 * catalog — the result is bounded either way.
 */
export type GetInventoryStatusInput = ToolInput<"get_inventory_status">;

/**
 * A sale is one automatic discount with an expiry, so what it covers is a
 * property of that single object rather than a count of writes. `applies_to`
 * names the target the way Shopify models it; `variant_ids` belongs to the
 * enumerated form and is meaningless without it.
 */
export interface CreateFlashSaleInput {
  applies_to: FlashSaleScope;
  variant_ids?: string[];
  discount_percentage: number;
  duration_hours: number;
  name?: string;
}

export type FlashSaleScope = "entire_catalog" | "variants";

/** Omitting the id lists what is running, so ending one is always one call. */
export interface EndFlashSaleInput {
  flash_sale_id?: string;
}

/**
 * Enumerated repricing. Each variant is named with its own new price; there is
 * no pattern, percentage-across-a-collection, or wildcard form to express.
 */
export interface SetVariantPricesInput {
  prices: { variant_id: string; price: number }[];
}

export type SearchKbInput = ToolInput<"search_kb">;

export type SupportStatsInput = ToolInput<"get_support_stats">;

export type ToolGroup =
  | "knowledge"
  | "product"
  | "customer"
  | "order"
  | "thread"
  | "messaging"
  | "insights";

// A capability the executing context must provide for a tool to run: `shopify`
// (ctx.shopify), `thread-io` (ctx.io), `kb`/`stats` (org-scoped deps, always
// injected in the shared executor). Tools declare what they need; the executor
// gates on it and modules select their tool set from what their context offers.
export type ToolCapability = "shopify" | "thread-io" | "kb" | "stats";

export interface RefundToolResult extends ToolResult {
  /** What the refund cost the shop, in the shop's currency: the amount the daily budget counts. */
  refundedCents: number | null;
}

export interface SpendToolResult extends ToolResult {
  spentCents: number | null;
}

export interface KnowledgeBaseToolArticle {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

export interface ShopifyToolContext {
  shop: string;
  accessToken: string;
  operationId?: string;
  executionId?: string;
}

export interface ToolExecutionDeps {
  searchShopifyProducts(input: SearchShopifyProductsInput, ctx: ShopifyToolContext, storefront?: boolean): Promise<ToolResult>;
  getInventoryStatus(input: GetInventoryStatusInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  findCustomer(input: FindCustomerInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  updateShopifyCustomerInfo(input: UpdateShopifyCustomerInfoInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getShopifyOrders(input: GetShopifyOrdersInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  updateShopifyOrderAddress(input: UpdateShopifyOrderAddressInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  addShopifyCustomerNote(input: AddShopifyCustomerNoteInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getOrderByName(input: GetOrderByNameInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getOrderFulfillmentStatus(input: GetOrderFulfillmentStatusInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getOrderTracking(input: GetOrderTrackingInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createRefund(input: CreateRefundInput, ctx: ShopifyToolContext): Promise<RefundToolResult>;
  createPartialRefund(
    input: CreatePartialRefundInput,
    ctx: ShopifyToolContext,
    settings: OrgSettings,
  ): Promise<RefundToolResult>;
  cancelOrder(input: CancelOrderInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createShopifyOrder(
    input: CreateShopifyOrderInput,
    ctx: ShopifyToolContext,
    options: { allowCustomLineItems: boolean },
  ): Promise<ToolResult>;
  editShopifyOrder(input: EditShopifyOrderInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createReturn(input: CreateReturnInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createExchange(input: CreateExchangeInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  getExchangeQuote(input: ExchangeQuoteInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createGiftCard(input: CreateGiftCardInput, ctx: ShopifyToolContext): Promise<SpendToolResult>;
  attachReturnLabel(input: AttachReturnLabelInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  fulfillOrder(input: FulfillOrderInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  searchKnowledgeBaseArticles(orgId: string, words: readonly string[]): Promise<KnowledgeBaseToolArticle[]>;
  /** The candidates that answer the query; `null` when that could not be decided. */
  selectAnsweringKbArticles(request: {
    orgId: string;
    query: string;
    articles: readonly KnowledgeBaseToolArticle[];
    settings: OrgSettings;
    taskBudget?: TaskModelBudget;
  }): Promise<KnowledgeBaseToolArticle[] | null>;
  recordKnowledgeBaseCitations(orgId: string, threadId: string, articleIds: readonly string[]): Promise<unknown>;
  getSupportStats(orgId: string, days: number): Promise<SupportStatsSummary>;
  // Server-only DB write, injected like the operations above so the registry
  // graph (which feeds client-imported TOOL_LABELS) never statically pulls
  // `@shopkeeper/db`.
  recordReturnWatch(params: RecordReturnWatchParams): Promise<void>;
}

export interface ToolPolicyMetadata {
  categoryPermission: boolean;
  refundAmountLimits?: boolean;
  /**
   * That this tool's compensation spends against the daily budget, and where its
   * amount comes from. `"input"` is on the call the model made, so the executor
   * reserves it before dispatch. `"provider"` only exists once Shopify has priced
   * the selection, so the adapter reserves it mid-execution through
   * `ShopifyContext.reserveCompensation`.
   */
  dailyRefundSpendLimit?: "input" | "provider";
  cancellationDisabled?: boolean;
  customLineItemsDisabled?: boolean;
  /**
   * The tool cannot make what it creates free, so a call whose `payment` is
   * `"free"` is refused and the merchant decides how to handle it.
   */
  freeOfChargeRefused?: boolean;
  /**
   * The tool pays out or replaces, so on a damage claim it needs the customer's
   * photo first and the merchant's review after (`damageEvidence` setting).
   */
  damageEvidence?: true;
}

export type ToolAvailability = "active" | "retired";

/**
 * Work a tool leaves for the merchant to do themselves, because Shopkeeper has no
 * capability for it. `send_return_label`: a return needs a shipping label, and
 * Shopify does not sell return labels to apps.
 */
export type MerchantFollowUp = "send_return_label";

export type ToolParser<TInput> = (input: unknown) => TInput;

export interface AgentToolDefinition<TInput = unknown, TName extends string = string> {
  name: TName;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  parse: ToolParser<TInput>;
  category: ToolCategory;
  group: ToolGroup;
  capabilities: readonly ToolCapability[];
  labels: {
    executed: string;
    planStep: string;
  };
  policy: ToolPolicyMetadata;
  availability: ToolAvailability;
  /**
   * Shopify OAuth scopes this tool cannot run without. Empty for every tool
   * that shipped before the gate existed, so an existing merchant's grant keeps
   * covering everything it covered before.
   */
  requiredScopes: readonly ShopifyOAuthScope[];
  /**
   * A migrated write must return a schema-valid receipt whenever the runtime
   * supplies stable execution and operation identities. Older/taskless callers
   * remain compatible while their result boundary is still in service.
   */
  requiredReceiptVersion: 1 | null;
  /** What this tool leaves for the merchant to do themselves. */
  merchantFollowUp: MerchantFollowUp | null;
  /** The merchant follow-up this tool does itself, such as attaching a label they sent. */
  completesMerchantFollowUp: MerchantFollowUp | null;
  execute(
    input: TInput,
    ctx: BaseAgentContext,
    settings: OrgSettings,
    deps: ToolExecutionDeps,
  ): Promise<ToolResult>;
}
