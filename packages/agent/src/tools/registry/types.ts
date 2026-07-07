import type Anthropic from "@anthropic-ai/sdk";
import type { BaseAgentContext } from "../../agent-context.js";
import type { OrgSettings, ToolCategory } from "../../types.js";
import type { ToolResult } from "../result.js";
import type { SupportStatsSummary } from "../support-stats-types.js";

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

export interface AskOperatorInput {
  question: string;
}

export interface EditShopifyOrderInput {
  order_id: string;
  variant_id?: string;
  quantity?: number;
  remove_variant_id?: string;
}

export interface IssueDiscountInput {
  percentage: number;
  reason?: string;
  expires_in_days?: number;
}

export interface CreateReturnInput {
  order_id: string;
  variant_id?: string;
  reason?:
    | "unwanted"
    | "defective"
    | "wrong_item"
    | "not_as_described"
    | "too_large"
    | "too_small"
    | "style"
    | "color"
    | "other";
}

export interface IssueStoreCreditInput {
  customer_id: string;
  amount: string;
  expires_in_days?: number;
}

export interface CreateGiftCardInput {
  amount: string;
  customer_id?: string;
  reason?: string;
  expires_in_days?: number;
}

export interface CreateExchangeInput {
  order_id: string;
  variant_id: string;
  exchange_variant_id: string;
  quantity?: number;
  reason?: CreateReturnInput["reason"];
}

export interface AttachReturnLabelInput {
  order_id: string;
  label_url: string;
  tracking_number?: string;
}

export interface GetOrderTrackingInput {
  order_id: string;
}

export interface SearchKbInput {
  query: string;
}

export interface SupportStatsInput {
  days: number;
}

export type ToolGroup =
  | "knowledge"
  | "product"
  | "customer"
  | "order"
  | "thread"
  | "messaging"
  | "insights";

export interface RefundToolResult extends ToolResult {
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
  issueDiscount(input: IssueDiscountInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createReturn(input: CreateReturnInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  createExchange(input: CreateExchangeInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  issueStoreCredit(input: IssueStoreCreditInput, ctx: ShopifyToolContext): Promise<SpendToolResult>;
  createGiftCard(input: CreateGiftCardInput, ctx: ShopifyToolContext): Promise<SpendToolResult>;
  attachReturnLabel(input: AttachReturnLabelInput, ctx: ShopifyToolContext): Promise<ToolResult>;
  incrementDailyRefundSpendCents(orgId: string, cents: number): Promise<unknown>;
  searchKnowledgeBaseArticles(orgId: string, words: readonly string[]): Promise<KnowledgeBaseToolArticle[]>;
  recordKnowledgeBaseCitations(orgId: string, threadId: string, articleIds: readonly string[]): Promise<unknown>;
  getSupportStats(orgId: string, days: number): Promise<SupportStatsSummary>;
}

export interface ToolPolicyMetadata {
  categoryPermission: boolean;
  refundAmountLimits?: boolean;
  dailyRefundSpendLimit?: boolean;
  cancellationDisabled?: boolean;
  customLineItemsDisabled?: boolean;
  discountPercentLimit?: boolean;
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
