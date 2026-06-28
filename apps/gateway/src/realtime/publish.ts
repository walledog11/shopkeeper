import { getGatewayRedis } from '../clients/redis-client.js';
import logger from '../logger.js';

// Single global pub/sub channel. The SSE server filters by orgId in-process per
// connected client, which avoids dynamic SUBSCRIBE/UNSUBSCRIBE as clients come
// and go. Events are invalidation signals, never data — the browser refetches
// through its own authenticated routes.
export const REALTIME_CHANNEL = 'realtime:thread';

export interface ThreadEvent {
  orgId: string;
  threadId: string;
}

// Best-effort: a realtime publish failure must never break message ingestion.
export async function publishThreadEvent(orgId: string, threadId: string): Promise<void> {
  try {
    const payload: ThreadEvent = { orgId, threadId };
    await getGatewayRedis().publish(REALTIME_CHANNEL, JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err: (err as Error).message, orgId, threadId }, '[Realtime] publishThreadEvent failed');
  }
}
