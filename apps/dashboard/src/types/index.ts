// Enums matching the Prisma schema
export type ChannelType = "ig_dm" | "email" | "tiktok" | "shopify" | "sms" | "sms_agent" | "dashboard_agent";
export type ThreadStatus = "open" | "pending" | "closed";
export type SenderType = "customer" | "agent" | "ai" | "note";

// Settings stored as JSON on the Organization
export interface AgentToolPermissions {
  action: boolean;        // Shopify write ops: refund, cancel, update address, etc.
  communication: boolean; // send_reply
  internal: boolean;      // add_internal_note, update_thread_status, update_thread_tag
  read: boolean;          // get_shopify_customer, get_shopify_orders, get_order_by_name
}

export interface OrgSettings {
  // AI draft / summary
  aiContext: string;   // brand name / context fed into AI drafts
  brandVoice: string;  // tone brief appended to AI system prompt

  // Agent identity
  agentName: string;

  // Default behavior
  autoPlanOnOpen: boolean;
  alwaysDraftReply: boolean;
  defaultInstruction: string;

  // Approval workflow
  requireApprovalForActions: boolean;

  // Tool permissions
  toolsEnabled: AgentToolPermissions;

  // Guardrails
  maxRefundAmount: number | null;  // null = unlimited
  blockCancellations: boolean;
  blockCustomLineItems: boolean;
  maxIterations: number;

  // Response
  replyLanguage: string; // "auto" | ISO language name e.g. "English"
}

// Database models
export interface Organization {
  id: string;
  clerkOrgId: string;
  name: string;
  settings: OrgSettings | null;
  createdAt: string;
}

export interface Integration {
  id: string;
  organizationId: string;
  platform: ChannelType;
  externalAccountId: string;
  fromEmail: string | null;
  accessToken: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  organizationId: string;
  name: string | null;
  platformId: string;
  profilePicUrl: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  senderType: SenderType;
  contentText: string | null;
  mediaUrl: string | null;
  sentAt: string;
}

export interface ActionLogEntry {
  id: string;
  sentAt: string;
  threadId: string;
  channelType: string;
  threadTag: string | null;
  customerHandle: string;
  instruction: string | null;
  summary: string;
  actions: Array<{ tool: string; result: string }>;
}

export interface Thread {
  id: string;
  organizationId: string;
  customerId: string;
  channelType: ChannelType;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  aiSummary: string | null;
  tag: string | null;
  shopifyCustomerId: string | null;
  customer: Customer;
  messages: Message[];
}

// Agent turn in the notes tab
export interface AgentTurn {
  instruction: string
  actions: { tool: string; result: string }[]
  summary: string | null
  error: string | null
  senderPhone?: string | null
}

// Agent plan — proposed steps before execution
export type ToolCategory = 'action' | 'communication' | 'internal' | 'read'

export interface RawToolCall {
  id: string
  name: string
  input: unknown
}

export interface PlanStep {
  id: string          // matches RawToolCall.id
  tool: string
  label: string
  description: string
  category: ToolCategory
  enabled: boolean
}

export interface AgentPlan {
  instruction: string
  steps: PlanStep[]          // visible steps (reads excluded)
  rawToolCalls: RawToolCall[] // all tool calls including reads
}

// UI-mapped ticket shape used in the tickets page
export interface Ticket {
  id: string;
  channelType: ChannelType;
  platform: string;
  logo: string;
  customer: string;
  time: string;
  subject: string;
  preview: string;
  tag: string;
  tagColor: string;
  aiSummary: string;
  status: ThreadStatus;
  messages: {
    sender: SenderType;
    text: string | null;
    time: string;
    author?: string;
    isAgentNote?: boolean;
  }[];
}

export interface FailedMessage {
  id: string;
  threadId: string;
  text: string;
  isNote: boolean;
}
