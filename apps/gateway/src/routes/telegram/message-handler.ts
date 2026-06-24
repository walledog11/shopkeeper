import { db } from '@shopkeeper/db';
import logger from '../../logger.js';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeFreeFormInstruction, handleOrderLookup } from './agent-execution.js';
import {
  isDigestCommand,
  isPendingPlanCommand,
  parseTelegramCommand,
} from './command-parser.js';
import { handleDigestCommand } from './digest-commands.js';
import { HELP_TEXT } from './format.js';
import { handlePendingPlanCommand } from './pending-plan-commands.js';
import { handlePendingQuestionAnswer } from './pending-question-commands.js';
import { handleStartBinding } from './start-binding.js';
import { withOperatorPresence } from './presence.js';
import type { TelegramMessageContext } from './types.js';
import type { OperatorMessageContext } from '../operator-message.js';

export async function handleTelegramMessage(
  message: TelegramMessageContext & { body: string },
): Promise<void> {
  const { chatId, body, reply } = message;
  const command = parseTelegramCommand(body);
  if (command.type === 'start') {
    await handleStartBinding(chatId, command.token, message.metadata, reply);
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

  const operatorMessage: OperatorMessageContext = {
    chatId,
    body,
    reply,
    senderRef: `telegram:${chatId}`,
    presence: (progress, work) =>
      withOperatorPresence({ chatId, messageId: message.messageId, reply, progress }, work),
  };

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

  if (isDigestCommand(command) && await handleDigestCommand(organizationId, command, context, operatorMessage)) {
    return;
  }

  if (
    isPendingPlanCommand(command)
    && await handlePendingPlanCommand(organizationId, clerkUserId, operatorMessage, command, context)
  ) {
    return;
  }

  if (
    command.type === 'order-lookup'
    && await handleOrderLookup(organizationId, chatId, command.orderNumber, reply)
  ) {
    return;
  }

  if (
    command.type === 'free-form'
    && await handlePendingQuestionAnswer(organizationId, operatorMessage, context)
  ) {
    return;
  }

  await executeFreeFormInstruction(organizationId, clerkUserId, operatorMessage, context);
}
