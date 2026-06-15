import type {
  AgentToolPermissions,
  SampleReply,
  OrgSettings,
  OrgSettingsPatch,
  ToolCategory,
  RawToolCall,
  PlanStep,
  AgentPlan,
  AgentTurn,
} from "@shopkeeper/agent/types";
import type {
  ChannelType as DbChannelType,
  SenderType as DbSenderType,
  ThreadFilterFeedback as DbThreadFilterFeedback,
  ThreadFilterStatus as DbThreadFilterStatus,
  ThreadStatus as DbThreadStatus,
  VoiceProposal as DbVoiceProposal,
} from "@shopkeeper/db";

// DB enum value types come from @shopkeeper/db so dashboard DTOs cannot drift from
// Prisma enum changes.
export type ChannelType = DbChannelType;
export type ThreadStatus = DbThreadStatus;
export type SenderType = DbSenderType;
export type ThreadFilterStatus = DbThreadFilterStatus;
export type ThreadFilterFeedback = DbThreadFilterFeedback;

// Agent-domain types live in @shopkeeper/agent/types; re-exported here so existing
// `@/types` imports are unchanged.
export type {
  AgentToolPermissions,
  SampleReply,
  OrgSettings,
  OrgSettingsPatch,
  ToolCategory,
  RawToolCall,
  PlanStep,
  AgentPlan,
  AgentTurn,
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
  connectionState?: 'active' | 'invalid' | 'incomplete';
  metadata?: unknown;
  createdAt: string;
  lastActivity?: string | null;
  threadsThisWeek?: number;
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
  sendStatus?: string | null;
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
  feedback: 'good' | null;
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

// UI-mapped ticket shape used in the tickets page
export interface Ticket {
  id: string;
  channelType: ChannelType;
  platform: string;
  logo: string;
  customer: string;
  customerRecord: Customer | null;
  time: string;
  lastMessageAt: string;
  subject: string;
  preview: string;
  tag: string;
  tagColor: string;
  aiSummary: string;
  status: ThreadStatus;
  lastCustomerMessageAt: string | null;
  hasPlan: boolean;
  cachedPlan: unknown | null;
  cachedPlanMessageId: string | null;
  shopifyCustomerId: string | null;
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
    sendStatus?: string | null;
  }[];
}

export interface FailedMessage {
  id: string;
  threadId: string;
  text: string;
  isNote: boolean;
}
