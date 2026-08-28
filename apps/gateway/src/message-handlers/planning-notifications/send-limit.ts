import logger from '../../logger.js';
import { listOperatorBindings } from '../../operator-notify.js';
import { notifyCriticalToAllOperators } from './delivery.js';

// Reports a degrade rather than asking for an approval, so it carries no pending
// state and no card — the merchant has nothing to decide here, only something to
// know. Sent once per billing period; the caller owns that marker, because the
// operator-notify dedupe is a one-hour Redis TTL and cannot express "once this
// month".
export async function sendConversationLimitNotification(
  organizationId: string,
  threadId: string,
  allowance: { tier: string; limit: number; used: number },
  period: string,
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping conversation limit notification');
    return;
  }

  // Names what stopped, what did not, and what fixes it. The middle clause is
  // the one that matters: a merchant who reads this must not think their
  // customers are being dropped.
  const body = [
    `You've passed your ${allowance.tier} plan's ${allowance.limit} conversations for this month — ${allowance.used} so far.`,
    '',
    "I've paused drafting plans for new conversations. Nothing is being dropped: messages still land in your inbox and you can reply to them yourself. Upgrade and I'll pick straight back up.",
  ].join('\n');

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body,
      contextPatch: {},
      idempotencyKey: `conversation-limit:${organizationId}:${period}`,
    }),
    threadId,
    'Conversation limit notification',
  );
}
