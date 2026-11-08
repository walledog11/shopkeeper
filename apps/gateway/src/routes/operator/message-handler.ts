import { db } from '@shopkeeper/db';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, loadLiveOperatorContext, updateContext } from '../../operator-context.js';
import { resolveOperatorMemberKey } from '../../operator-identity.js';
import { buildMirroredReply } from '../../operator-thread-mirror.js';
import type { OperatorMessageContext } from '../operator-message.js';
import { executeFreeFormInstruction } from './agent-execution.js';
import { isDigestCommand, isPendingPlanCommand, parseOperatorCommand } from './command-parser.js';
import { handleDigestCommand } from './digest-commands.js';
import { HELP_TEXT } from './format.js';
import { handlePendingPlanCommand } from './pending-plan-commands.js';

// Every transport shares command policy and person-scoped pending state.
export async function runOperatorTurn(
  organizationId: string,
  clerkUserId: string,
  message: Omit<OperatorMessageContext, 'senderRef'>,
): Promise<void | 'queued'> {
  const memberKey = await resolveOperatorMemberKey(organizationId, clerkUserId);
  const context = await loadLiveOperatorContext(
    organizationId, memberKey, await getContext(organizationId, memberKey),
  );
  const baseMessage: OperatorMessageContext = { ...message, senderRef: memberKey };
  // Freeform turns persist their own exchange. Commands mirror their inbound
  // message once and each reply onto the same durable operator thread.
  const reply = buildMirroredReply(organizationId, memberKey, message.body, message.reply);
  const commandMessage = { ...baseMessage, reply };
  const command = parseOperatorCommand(message.body);

  if (command.type === 'help') {
    await reply(HELP_TEXT);
    return;
  }
  if (command.type === 'summary') {
    const org = await db.organization.findUnique({
      where: { id: organizationId }, select: { settings: true },
    });
    const settings = (org?.settings as Record<string, unknown> | null) ?? {};
    const digest = await buildOrgDigest(organizationId, new Date(), settings);
    if (!digest) {
      await reply('Nothing new in your support inbox right now.');
      return;
    }
    await updateContext(organizationId, memberKey, { pendingDigest: digest.pendingDigest });
    await reply(digest.message);
    return;
  }
  if (isDigestCommand(command) && await handleDigestCommand(organizationId, command, context, commandMessage)) {
    return;
  }
  if (isPendingPlanCommand(command)
    && await handlePendingPlanCommand(organizationId, clerkUserId, commandMessage, command, context)) {
    return;
  }
  return executeFreeFormInstruction(organizationId, clerkUserId, baseMessage);
}
