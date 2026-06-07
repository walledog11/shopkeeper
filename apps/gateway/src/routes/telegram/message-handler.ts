import { db } from '@shopkeeper/db';
import logger from '../../logger.js';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeFreeFormInstruction, handleOrderLookup } from './agent-execution.js';
import {
  parseTelegramCommand,
  type DigestCommand,
  type PendingPlanCommand,
} from './command-parser.js';
import { handleDigestCommand } from './digest-commands.js';
import { HELP_TEXT } from './format.js';
import { handlePendingPlanCommand } from './pending-plan-commands.js';
import { handleStartBinding } from './start-binding.js';
import type { TelegramReply } from './types.js';

const DIGEST_COMMAND_TYPES = new Set([
  'digest-review',
  'digest-open',
  'digest-spam',
  'digest-reply',
]);
const PENDING_PLAN_COMMAND_TYPES = new Set([
  'plan-run',
  'plan-dismiss',
  'plan-skip',
]);

function isDigestCommand(command: { type: string }): command is DigestCommand {
  return DIGEST_COMMAND_TYPES.has(command.type);
}

function isPendingPlanCommand(command: { type: string }): command is PendingPlanCommand {
  return PENDING_PLAN_COMMAND_TYPES.has(command.type);
}

export async function handleTelegramMessage(
  chatId: string,
  body: string,
  reply: TelegramReply,
): Promise<void> {
  const command = parseTelegramCommand(body);
  if (command.type === 'start') {
    await handleStartBinding(chatId, command.token, reply);
    return;
  }

  const chat = await db.orgMemberTelegramChat.findUnique({
    where: { chatId },
    include: { orgMember: true },
  });
  const member = chat?.orgMember ?? null;
  if (!member) {
    logger.warn({ chatId }, '[Telegram] Unbound sender');
    await reply(
      "This chat isn't connected to a Shopkeeper workspace. Generate a link from your Shopkeeper dashboard under Integrations → Telegram.",
    );
    return;
  }

  const { organizationId, clerkUserId } = member;
  const context = await getContext(organizationId, chatId);

  if (command.type === 'help') {
    await reply(HELP_TEXT);
    return;
  }

  if (command.type === 'summary') {
    const digest = await buildOrgDigest(organizationId, new Date());
    if (!digest) {
      await reply('Your support inbox is empty — no open tickets.');
      return;
    }
    await updateContext(organizationId, chatId, { pendingDigest: digest.pendingDigest });
    await reply(digest.message);
    return;
  }

  if (isDigestCommand(command) && await handleDigestCommand(organizationId, command, context, reply)) {
    return;
  }

  if (
    isPendingPlanCommand(command)
    && await handlePendingPlanCommand(organizationId, clerkUserId, chatId, body, command, context, reply)
  ) {
    return;
  }

  if (
    command.type === 'order-lookup'
    && await handleOrderLookup(organizationId, chatId, command.orderNumber, reply)
  ) {
    return;
  }

  await executeFreeFormInstruction(organizationId, clerkUserId, chatId, body, context, reply);
}
