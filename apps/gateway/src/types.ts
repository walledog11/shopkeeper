import type { ChannelType } from '@clerk/db';

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
}

export interface AiSummaryJobData {
  threadId: string;
  organizationId: string;
  customerName: string | null;
  channelType: ChannelType;
  traceId?: string;
}
