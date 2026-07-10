/**
 * Mirror the operator conversation into one durable thread.
 *
 * A binding's inbound texts, the agent's replies, and the system notifications
 * it pushes (plans, questions, digests) all belong to the same conversation.
 * Persisting them to the merchant's single `sms_agent` thread (resolved from the
 * binding key) is what lets the agent read what the merchant is replying to.
 * Mirroring is best-effort — a failure here must never break the real send.
 */

import { createMessage } from '@shopkeeper/db';
import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import logger from './logger.js';
import type { OperatorReply } from './routes/operator-message.js';

type MirrorSenderType = 'customer' | 'agent';

export async function mirrorOperatorMessage(
  organizationId: string,
  operatorKey: string,
  senderType: MirrorSenderType,
  body: string,
): Promise<void> {
  if (!body.trim()) return;
  try {
    const thread = await resolveOperatorThread(organizationId, operatorKey);
    await createMessage({ threadId: thread.id, organizationId, senderType, contentText: body });
  } catch (err) {
    logger.warn(
      { err, organizationId, operatorKey, senderType },
      '[OperatorThreadMirror] Failed to mirror message',
    );
  }
}

// Wraps a transport reply so command-path replies land on the operator thread as
// `agent`, and the inbound body is mirrored once (as `customer`) the first time a
// reply is produced — i.e. only when a command actually handles the message.
// Freeform turns persist both sides themselves and keep using the raw reply.
export function buildMirroredReply(
  organizationId: string,
  operatorKey: string,
  inboundBody: string,
  rawReply: OperatorReply,
): OperatorReply {
  let inboundMirrored = false;
  return async (text: string) => {
    await rawReply(text);
    if (!inboundMirrored) {
      inboundMirrored = true;
      await mirrorOperatorMessage(organizationId, operatorKey, 'customer', inboundBody);
    }
    await mirrorOperatorMessage(organizationId, operatorKey, 'agent', text);
  };
}
