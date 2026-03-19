// Enums matching the Prisma schema
export type ChannelType = "ig_dm" | "email" | "tiktok";
export type ThreadStatus = "open" | "pending" | "closed";
export type SenderType = "customer" | "agent" | "ai";

// Database models
export interface Organization {
  id: string;
  clerkOrgId: string;
  name: string;
  createdAt: string;
}

export interface Integration {
  id: string;
  organizationId: string;
  platform: ChannelType;
  externalAccountId: string;
  accessToken: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  organizationId: string;
  name: string | null;
  platformId: string;
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
  customer: Customer;
  messages: Message[];
}

// UI-mapped ticket shape used in the tickets page
export interface Ticket {
  id: string;
  platform: string;
  logo: string;
  customer: string;
  time: string;
  subject: string;
  preview: string;
  tag: string;
  tagColor: string;
  aiSummary: string;
  messages: {
    sender: SenderType;
    text: string | null;
    time: string;
  }[];
}
