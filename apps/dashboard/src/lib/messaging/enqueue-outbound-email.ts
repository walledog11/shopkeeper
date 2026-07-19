import logger from '@/lib/server/logger';
import type { ReplySource } from '@shopkeeper/analytics';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import {
  fetchProviderWithDeadline,
  isProviderRequestTimeoutError,
} from '@/lib/server/provider-fetch';

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

export type EnqueueOutboundEmailResult = 'enqueued' | 'failed' | 'unknown';

// Phase 1.5 (option A): enqueue the actual provider send onto the gateway's
// BullMQ queue over an internal HTTP hop. Returns false on any failure so the
// caller can distinguish a definite rejection from an ambiguous network outcome.
export async function enqueueOutboundEmail(
  input: EnqueueOutboundEmailInput,
): Promise<EnqueueOutboundEmailResult> {
  const base = getGatewayBaseUrl();
  if (!base) {
    logger.error({ messageId: input.messageId }, '[enqueueOutboundEmail] No gateway base URL');
    return 'failed';
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.error({ messageId: input.messageId }, '[enqueueOutboundEmail] INTERNAL_API_SECRET unset');
    return 'failed';
  }

  try {
    const res = await fetchProviderWithDeadline(`${base}/internal/queue/outbound-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(input),
    }, {
      provider: 'gateway',
      operation: 'outbound-email queue admission',
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logger.error(
        { status: res.status, messageId: input.messageId, body: errBody.slice(0, 300) },
        '[enqueueOutboundEmail] Gateway enqueue failed',
      );
      return 'failed';
    }
    return 'enqueued';
  } catch (err) {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        messageId: input.messageId,
        timedOut: isProviderRequestTimeoutError(err),
      },
      '[enqueueOutboundEmail] Gateway enqueue outcome unknown',
    );
    return 'unknown';
  }
}

export function isOutboundEmailAsyncEnabled(): boolean {
  return process.env.OUTBOUND_EMAIL_ASYNC === 'true';
}
