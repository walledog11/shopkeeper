// Enums matching the Prisma schema
export type ChannelType = "ig_dm" | "email" | "tiktok" | "shopify" | "sms" | "sms_agent" | "dashboard_agent";
export type ThreadStatus = "open" | "pending" | "closed";
export type SenderType = "customer" | "agent" | "ai" | "note";
export type ThreadFilterStatus = "genuine" | "questionable" | "filtered";
export type ThreadFilterFeedback = "none" | "confirmed_genuine" | "confirmed_spam";

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
  maxRefundAmount: number | null;  // per-call cap in USD; null = unlimited
  dailyRefundCap: number | null;   // cumulative org-wide cap in USD per UTC day; null = unlimited
  blockCancellations: boolean;
  blockCustomLineItems: boolean;
  maxIterations: number;

  // Response
  replyLanguage: string; // "auto" | ISO language name e.g. "English"

  // Operator digest (Telegram)
  digestEnabled: boolean;
  digestFrequency: 'daily' | 'twice_daily' | 'every_4h' | 'every_6h' | 'every_8h' | 'every_12h';
  digestHour: number;           // 0–23 local time — first (or only) send time
  digestSecondHour: number;     // 0–23 local time — second send time, only used for twice_daily
  digestDays: 'every_day' | 'weekdays';
  digestTimezone?: string;      // IANA tz, e.g. "America/New_York". Preferred.
  digestTimezoneOffset: number; // integer UTC offset (legacy fallback for orgs that haven't migrated)

  // Business hours
  businessHoursEnabled: boolean;
  businessHoursStart: number;          // 0–23 local hour open (inclusive)
  businessHoursEnd: number;            // 0–23 local hour close (exclusive)
  businessHoursDays: string[];         // e.g. ['mon','tue','wed','thu','fri']
  businessHoursTimezone?: string;      // IANA tz. Preferred.
  businessHoursTimezoneOffset: number; // integer UTC offset (legacy fallback)
  autoAckMessage: string;

  // Spam filter
  spamFilterEnabled?: boolean;
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
  tokenExpiresAt: string | null;
  metadata?: unknown;
  createdAt: string;
  lastActivity?: string | null;
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
  attachments: string[];
  sentAt: string;
}

export interface CannedResponse {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  tags: string[];
  channels: string[];
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticle {
  id: string;
  organizationId: string;
  knowledgeBaseId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  citationCount?: number;
  citationCountWeek?: number;
  lastCitedAt?: string | null;
}

export type KbSource = 'shopify' | 'user';

export interface KnowledgeBase {
  id: string;
  organizationId: string;
  name: string;
  source: KbSource;
  createdAt: string;
  articles: KbArticle[];
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
  lastMessageAt: string;
  aiSummary: string | null;
  subject: string | null;
  tag: string | null;
  shopifyCustomerId: string | null;
  cachedPlanMessageId: string | null;
  cachedPlan: unknown | null;
  filterStatus: ThreadFilterStatus;
  filterReason: string | null;
  filterFeedback: ThreadFilterFeedback;
  customer: Customer;
  messages: Message[];
}

// Agent turn in the notes tab
export interface AgentTurn {
  id?: string
  instruction: string
  actions: { tool: string; result: string }[]
  summary: string | null
  error: string | null
  senderPhone?: string | null
  clerkUserId?: string | null
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
  readResults?: Record<string, string> // tool_use.id → raw result string, for read-only tools
  warnings?: string[]
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
  lastCustomerMessageAt: string | null;
  hasPlan: boolean;
  filterStatus: ThreadFilterStatus;
  filterReason: string | null;
  messages: {
    sender: SenderType;
    text: string | null;
    time: string;
    author?: string;
    id: string;
    isAgentNote?: boolean;
    attachments: string[];
    rating?: number | null;
  }[];
}

export interface FailedMessage {
  id: string;
  threadId: string;
  text: string;
  isNote: boolean;
}

// Playbooks
export type PlaybookTriggerType = 'new_ticket' | 'tag_applied' | 'ticket_closed'

export interface PlaybookTrigger {
  type: PlaybookTriggerType
  tag?: string   // for tag_applied
}

export type PlaybookActionType = 'send_reply' | 'apply_tag' | 'close_ticket' | 'add_note'

export interface PlaybookAction {
  type: PlaybookActionType
  message?: string  // for send_reply
  tag?: string      // for apply_tag
  note?: string     // for add_note
}

export interface Playbook {
  id: string
  organizationId: string
  name: string
  enabled: boolean
  trigger: PlaybookTrigger
  actions: PlaybookAction[]
  runCount: number
  createdAt: string
  updatedAt: string
}
