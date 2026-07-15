import type { DbChannelType } from '@shopkeeper/db';

declare module 'http' {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

export interface PlanStep {
  label: string;
  description: string;
  category: string;
  tool?: string;
  enabled: boolean;
}

export interface AgentPlan {
  steps: PlanStep[];
  rawToolCalls: Array<{ id: string; name: string; [key: string]: unknown }>;
}

export interface ShopifyOrderPayload {
  id: number;
  order_number?: number;
  name?: string;
  customer?: {
    id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface InboundJobData {
  platform: string;
  organizationId: string;
  integrationId?: string;
  receivedAt?: string;
  traceId?: string;
  rawPayload?: unknown;
  topic?: string;
  senderId?: string;
  text?: string;
  externalMessageId?: string | null;
  externalSpaceId?: string | null;
  attachmentUrls?: string[];
  senderEmail?: string;
  senderName?: string | null;
  subject?: string;
  body?: string;
  inboundMessageId?: string | null;
  attachments?: Array<{ name: string; contentType: string; contentBase64: string }>;
}

export interface InstagramInboundAttachment {
  type: string;
  url: string | null;
}

export interface InstagramInboundJobData {
  platform: 'ig_dm';
  integrationId: string;
  organizationId: string;
  instagramAccountId: string;
  senderIgsid: string;
  externalMessageId: string | null;
  providerSentAt: string;
  text: string | null;
  attachments: InstagramInboundAttachment[];
  traceId: string;
}

export interface AiSummaryJobData {
  threadId: string;
  organizationId: string;
  sourceMessageId: string;
  customerName: string | null;
  channelType: DbChannelType;
  traceId?: string;
  // Set when the email path classified inline pre-persistence: skip the LLM
  // round-trip in generateThreadIntelligence, but still run plan precompute +
  // operator notification downstream.
  skipSummary?: boolean;
}

export interface OrderReviewJobData {
  organizationId: string;
  orderId: string;
  traceId?: string;
}

export type OutboundEmailSource =
  | 'dispatch_message'
  | 'agent_send_reply'
  | 'agent_send_email'
  | 'auto_ack';

export interface OutboundEmailJobData {
  organizationId: string;
  messageId: string;
  threadId: string;
  integrationId: string;
  replySource?: 'manual' | 'agent_approved' | 'agent_automatic';
  source: OutboundEmailSource;
  traceId?: string;
}

export interface GmailSyncJobData {
  integrationId: string;
  notifiedHistoryId: string;
  traceId: string;
}
