import type {
  AgentToolPermissions,
  SampleReply,
  OrgSettings,
  OrgSettingsPatch,
  ToolCategory,
  RawToolCall,
  PlanStep,
  AgentPlan,
} from "@clerk/agent";
import type {
  ChannelType as DbChannelType,
  SenderType as DbSenderType,
  ThreadFilterFeedback as DbThreadFilterFeedback,
  ThreadFilterStatus as DbThreadFilterStatus,
  ThreadStatus as DbThreadStatus,
  VoiceProposal as DbVoiceProposal,
} from "@clerk/db";

// DB enum value types come from @clerk/db so dashboard DTOs cannot drift from
// Prisma enum changes.
export type ChannelType = DbChannelType;
export type ThreadStatus = DbThreadStatus;
export type SenderType = DbSenderType;
export type ThreadFilterStatus = DbThreadFilterStatus;
export type ThreadFilterFeedback = DbThreadFilterFeedback;

// Agent-domain types now live in @clerk/agent (Track 2 extraction); re-exported
// here so existing `@/types` imports are unchanged.
export type {
  AgentToolPermissions,
  SampleReply,
  OrgSettings,
  OrgSettingsPatch,
  ToolCategory,
  RawToolCall,
  PlanStep,
  AgentPlan,
};

export type VoiceProposal = DbVoiceProposal;

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
  threadId: string | null;
  channelType: ChannelType | null;
  threadTag: string | null;
  customerHandle: string | null;
  instruction: string | null;
  summary: string;
  actions: Array<{
    tool: string;
    result: string;
    input?: unknown;
    durationMs?: number;
    status?: 'success' | 'error' | 'policy_block' | 'escalated';
  }>;
  mode: 'human_approved' | 'auto_executed' | 'read_only' | null;
  approver: { id: string; displayName: string | null } | null;
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
  actions: { tool: string; result: string; status?: 'success' | 'error' | 'policy_block' | 'escalated' }[]
  summary: string | null
  error: string | null
  mode?: 'human_approved' | 'auto_executed' | 'read_only'
  senderPhone?: string | null
  clerkUserId?: string | null
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
