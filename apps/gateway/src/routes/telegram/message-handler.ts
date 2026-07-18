import { db } from '@shopkeeper/db';
import logger from '../../logger.js';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeFreeFormInstruction } from './agent-execution.js';
import {
  isDigestCommand,
  isPendingPlanCommand,
  parseTelegramCommand,
} from './command-parser.js';
import { handleDigestCommand } from './digest-commands.js';
import { HELP_TEXT } from './format.js';
import { handlePendingPlanCommand } from './pending-plan-commands.js';
import { handleStartBinding } from './start-binding.js';
import { withOperatorPresence } from './presence.js';
import { buildMirroredReply } from '../../operator-thread-mirror.js';
import type { TelegramMessageContext, TelegramReply } from './types.js';
import type { OperatorMessageContext } from '../operator-message.js';

export const TELEGRAM_UNBOUND_REPLY =
  "This chat isn't connected to a Shopkeeper workspace. Generate a link from your Shopkeeper dashboard under Integrations → Telegram.";

export interface BoundTelegramMember {
  organizationId: string;
  clerkUserId: string;
}

// Reply-free binding resolution. Both the synchronous handler and the durable
// (P4-03) ingestion path resolve the bound member this way before running or
// enqueueing a turn; the durable worker re-runs it to re-validate ownership.
export async function resolveBoundTelegramMember(chatId: string): Promise<BoundTelegramMember | null> {
  const chat = await db.orgMemberTelegramChat.findUnique({
    where: { chatId },
    include: { orgMember: true },
  });
  const member = chat?.orgMember ?? null;
  if (!member) return null;
  return { organizationId: member.organizationId, clerkUserId: member.clerkUserId };
}

export interface TelegramOperatorTurnParams {
  organizationId: string;
  clerkUserId: string;
  chatId: string;
  body: string;
  messageId: number;
  reply: TelegramReply;
  turnId?: string;
}

// The operator turn for one bound Telegram message: keyword fast paths
// (help/summary/digest/pending-plan) then the free-form agent turn. Extracted so
// both the synchronous webhook path and the durable operator-event worker run
// identical logic; they differ only in the injected reply (provider send) and
// when the webhook is acknowledged.
export async function runTelegramOperatorTurn(params: TelegramOperatorTurnParams): Promise<void> {
  const { organizationId, clerkUserId, chatId, body, messageId, reply, turnId } = params;
  const operatorKey = `telegram:${chatId}`;
  const context = await getContext(organizationId, chatId);

  // Freeform turns persist their own thread messages, so they keep the raw reply.
  // Command paths reply through a wrapper that mirrors the exchange (inbound once,
  // then each reply) onto the merchant's durable operator thread.
  const baseMessage: OperatorMessageContext = {
    chatId,
    body,
    reply,
    senderRef: operatorKey,
    ...(turnId ? { turnId } : {}),
    presence: (progress, work) =>
      withOperatorPresence({ chatId, messageId, reply, progress }, work),
  };
  const mirroredReply = buildMirroredReply(organizationId, operatorKey, body, reply);
  const commandMessage: OperatorMessageContext = { ...baseMessage, reply: mirroredReply };

  const command = parseTelegramCommand(body);

  if (command.type === 'help') {
    await mirroredReply(HELP_TEXT);
    return;
  }

  if (command.type === 'summary') {
    const digest = await buildOrgDigest(organizationId, new Date());
    if (!digest) {
      await mirroredReply('Your support inbox is empty — no open tickets.');
      return;
    }
    await updateContext(organizationId, chatId, { pendingDigest: digest.pendingDigest });
    await mirroredReply(digest.message);
    return;
  }

  if (isDigestCommand(command) && await handleDigestCommand(organizationId, command, context, commandMessage)) {
    return;
  }

  if (
    isPendingPlanCommand(command)
    && await handlePendingPlanCommand(organizationId, clerkUserId, commandMessage, command, context)
  ) {
    return;
  }

  // Everything past the keyword fast path is one agent turn: the model reads the
  // pending-state ledger and drives approve/reject/revise/answer via control tools,
  // or handles a fresh instruction normally.
  await executeFreeFormInstruction(organizationId, clerkUserId, baseMessage, context);
}

export async function handleTelegramMessage(
  message: TelegramMessageContext & { body: string },
): Promise<void> {
  const { chatId, body, reply, messageId } = message;
  const command = parseTelegramCommand(body);
  if (command.type === 'start') {
    await handleStartBinding(chatId, command.token, message.metadata, reply);
    return;
  }

  const member = await resolveBoundTelegramMember(chatId);
  if (!member) {
    logger.warn({ chatId }, '[Telegram] Unbound sender');
    await reply(TELEGRAM_UNBOUND_REPLY);
    return;
  }

  await runTelegramOperatorTurn({
    organizationId: member.organizationId,
    clerkUserId: member.clerkUserId,
    chatId,
    body,
    messageId,
    reply,
  });
}
