// Enums matching the Prisma schema
export type ChannelType = "ig_dm" | "email" | "tiktok" | "shopify" | "sms" | "sms_agent";
export type ThreadStatus = "open" | "pending" | "closed";
export type SenderType = "customer" | "agent" | "ai" | "note";

// Settings stored as JSON on the Organization
export interface OrgSettings {
  aiContext: string;   // brand name / context fed into AI drafts
  brandVoice: string;  // tone brief appended to AI system prompt
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
  }[];
}
