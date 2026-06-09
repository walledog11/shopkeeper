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
  traceId?: string;
  rawPayload?: unknown;
  topic?: string;
  senderEmail?: string;
  senderName?: string | null;
  subject?: string;
  body?: string;
  inboundMessageId?: string | null;
  attachments?: Array<{ name: string; contentType: string; contentBase64: string }>;
}

export interface AiSummaryJobData {
  threadId: string;
  organizationId: string;
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
