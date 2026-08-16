import type { ClassifierSignals } from "./classifier-signals.js";
import type { ToolResult } from "./tools/result.js";
import type {
  AddInternalNoteInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "./tools/tool-inputs.js";

// Module-supplied I/O sink for the thread-coupled tools. Support wires this to
// the dashboard messaging stack (Postmark/IG/email); a thread-less module leaves
// it absent and these tools are filtered out of its tool set. Keeping it injected
// is what lets the executor live in a shared package that cannot import a message
// provider.
export interface AgentIO {
  addInternalNote(input: AddInternalNoteInput): Promise<ToolResult>;
  sendReply(input: SendReplyInput): Promise<ToolResult>;
  sendEmail(input: SendEmailInput): Promise<ToolResult>;
  updateThreadStatus(input: UpdateThreadStatusInput): Promise<ToolResult>;
  updateThreadTag(input: UpdateThreadTagInput): Promise<ToolResult>;
}

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency?: string | null;
  items: {
    line_item_id: string | null;
    title: string;
    quantity: number;
    variant_id: string | null;
    fulfillable_quantity: number | null;
    current_quantity: number | null;
    fulfillment_status: string | null;
  }[];
  shipping_address: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
}

export type AgentImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type AgentMessageAttachment =
  | {
      type: "image";
      reference: string;
      status: "available";
      mediaType: AgentImageMediaType;
      data: string;
    }
  | {
      type: "image";
      reference: string;
      status: "unavailable";
    };

export interface AgentRecentMessage {
  senderType: string;
  contentText: string | null;
  attachments?: AgentMessageAttachment[];
}

// Who the agent is talking to, when that is not simply "the merchant's known
// customer". `guest` is an anonymous storefront shopper: no verified identity,
// and nothing they say — an order number, an email, a Shopify ID — makes them
// one. It lives on the base context because enforcement happens in the shared
// executor, which is module-agnostic. Absent means the channel carries its own
// identity (email address, IG sender, operator binding) as it always has.
//
// `verified` is that same anonymous shopper after they proved control of the
// address on a specific order, by entering a code mailed to it. The proving
// happens entirely outside the agent — the host runs the challenge and the
// model only ever observes the result — so nothing the shopper says to the
// agent can produce this state either. It is scoped to the orders in
// `verifiedOrders` and never to a person: verification says "you can see this
// order", not "you are this customer".
export type AgentAuthState = "guest" | "verified";

// An order this session has proven control of. Both forms are carried because
// the tools take different keys — `get_order_by_name` a name, `get_order_tracking`
// a numeric id — and re-resolving one from the other at policy time would mean a
// Shopify round trip inside a permission check.
export interface VerifiedOrderRef {
  orderName: string;
  orderId: string;
}

// Module-agnostic agent context: the org identity and the conversation any
// module's agent loop operates on. Future modules compose their own context on
// top of this base.
export interface BaseAgentContext {
  orgId: string;
  orgName: string;
  authState?: AgentAuthState;
  // Empty unless `authState` is "verified". Order-scoped rather than
  // customer-scoped, so verifying one order never widens to the rest of that
  // customer's history.
  verifiedOrders?: VerifiedOrderRef[];
  recentMessages: AgentRecentMessage[];
  shopify: {
    shop: string;
    accessToken: string;
    // Host-generated identity for one tool call. Mutations that support
    // provider idempotency derive their stable provider key from this value.
    operationId?: string;
  } | null;
  // Module-supplied escalation/flag sink. Support routes a thread to a human;
  // a thread-less module records a finding. Every module must declare its path.
  escalate: (reason: string) => Promise<void>;
  // Module-supplied "ask the merchant a clarifying question" sink — the soft
  // sibling of escalate. Thread-coupled (it needs a surface to show the question
  // and collect the answer), so optional: thread-less modules omit it and the
  // ask_operator tool is filtered out of their tool set.
  askOperator?: (question: string) => Promise<void>;
  // Module-supplied I/O sink for the thread-coupled tools. Absent for thread-less
  // modules, whose tool sets exclude these tools.
  io?: AgentIO;
}

// Support module context: the base plus the ticket, customer, Shopify linkage,
// recent orders, and KB articles the support agent needs.
export interface SupportContext extends BaseAgentContext {
  thread: {
    id: string;
    status: string;
    channelType: string;
    tag: string | null;
    aiSummary: string | null;
    shopifyCustomerId: string | null;
  };
  customer: {
    id: string;
    name: string | null;
    platformId: string;
  };
  openThreadCount: number;
  recentOrders: ShopifyOrderSummary[];
  recentOrdersFetchFailed?: boolean;
  linkedShopifyCustomerName: string | null;
  kbArticles: { title: string; body: string }[];
  // Operator channel only: a host-rendered, opaque snapshot of what is awaiting the
  // merchant's decision (pending plan incl. draft bodies, pending question, digest
  // age). The core treats it as a string and drops it into the operator prompt's
  // `## Pending state` section; no gateway concept leaks into the package.
  operatorLedger?: string;
  // Dashboard Concierge only: the merchant is at the desk, so navigation tools apply.
  operatorDeskMode?: boolean;
  // Structured classifier signals persisted on the thread (Phase 1). Optional:
  // present only for classified inbound threads. Routing (Phase 2) reads it;
  // absent/null means fall back to the regex path.
  classifierSignals?: ClassifierSignals | null;
}

export type AgentContext = SupportContext;

export type AgentActionStatus = "success" | "error" | "policy_block" | "escalated" | "unknown";
export type AgentActionMode = "human_approved" | "auto_executed" | "read_only";

export interface ActionEntry {
  tool: string;
  result: string;
  input?: unknown;
  providerOperationKey?: string;
  durationMs?: number;
  status?: AgentActionStatus;
  mode?: AgentActionMode;
  errorDetail?: string;
  category?: string;
}

export interface AgentResult {
  summary: string;
  actionsPerformed: ActionEntry[];
}
