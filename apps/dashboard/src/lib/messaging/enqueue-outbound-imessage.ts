import logger from '@/lib/server/logger';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';

export type OutboundImessageSource =
  | 'dispatch_message'
  | 'agent_send_reply'
  | 'auto_ack';

export interface EnqueueOutboundImessageInput {
  organizationId: string;
  messageId: string;
  threadId: string;
  integrationId: string;
  source: OutboundImessageSource;
}

// Mirror of enqueueOutboundEmail: hand the actual Spectrum send to the gateway's
// BullMQ queue over an internal HTTP hop. The gateway owns the long-lived per-org
// Spectrum app, so the dashboard never calls Photon directly. Returns false on
// any failure so the caller can mark the pre-created message row failed.
export async function enqueueOutboundImessage(
  input: EnqueueOutboundImessageInput,
): Promise<boolean> {
  const base = getGatewayBaseUrl();
  if (!base) {
    logger.error({ messageId: input.messageId }, '[enqueueOutboundImessage] No gateway base URL');
    return false;
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.error({ messageId: input.messageId }, '[enqueueOutboundImessage] INTERNAL_API_SECRET unset');
    return false;
  }

  try {
    const res = await fetch(`${base}/internal/queue/outbound-imessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logger.error(
        { status: res.status, messageId: input.messageId, body: errBody.slice(0, 300) },
        '[enqueueOutboundImessage] Gateway enqueue failed',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error(
      { err: (err as Error).message, messageId: input.messageId },
      '[enqueueOutboundImessage] Gateway enqueue errored',
    );
    return false;
  }
}
