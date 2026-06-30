import logger from '@/lib/server/logger';
import type { ReplySource } from '@shopkeeper/analytics';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';

export type OutboundEmailSource =
  | 'dispatch_message'
  | 'agent_send_reply'
  | 'agent_send_email'
  | 'auto_ack';

export interface EnqueueOutboundEmailInput {
  organizationId: string;
  messageId: string;
  threadId: string;
  integrationId: string;
  replySource?: ReplySource;
  source: OutboundEmailSource;
}

// Phase 1.5 (option A): enqueue the actual provider send onto the gateway's
// BullMQ queue over an internal HTTP hop. Returns false on any failure so the
// caller can mark the pre-created message row failed and surface a retry.
export async function enqueueOutboundEmail(input: EnqueueOutboundEmailInput): Promise<boolean> {
  const base = getGatewayBaseUrl();
  if (!base) {
    logger.error({ messageId: input.messageId }, '[enqueueOutboundEmail] No gateway base URL');
    return false;
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.error({ messageId: input.messageId }, '[enqueueOutboundEmail] INTERNAL_API_SECRET unset');
    return false;
  }

  try {
    const res = await fetch(`${base}/internal/queue/outbound-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logger.error(
        { status: res.status, messageId: input.messageId, body: errBody.slice(0, 300) },
        '[enqueueOutboundEmail] Gateway enqueue failed',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error(
      { err: (err as Error).message, messageId: input.messageId },
      '[enqueueOutboundEmail] Gateway enqueue errored',
    );
    return false;
  }
}

export function isOutboundEmailAsyncEnabled(): boolean {
  return process.env.OUTBOUND_EMAIL_ASYNC === 'true';
}
