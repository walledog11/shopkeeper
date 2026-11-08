import { db } from '@shopkeeper/db';
import { runOperatorTurn } from '../operator/message-handler.js';
import { withOperatorPresence } from './presence.js';
import type { TelegramReply } from './types.js';

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
export async function runTelegramOperatorTurn(params: TelegramOperatorTurnParams): Promise<void | 'queued'> {
  const { organizationId, clerkUserId, chatId, body, messageId, reply, turnId } = params;
  return runOperatorTurn(organizationId, clerkUserId, {
    chatId,
    body,
    reply,
    deliveryRef: `telegram:${chatId}`,
    ...(turnId ? { turnId } : {}),
    presence: (progress, work) =>
      withOperatorPresence({ chatId, messageId, reply, progress }, work),
  });
}
