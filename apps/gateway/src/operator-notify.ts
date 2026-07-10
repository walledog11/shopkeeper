/**
 * Per-member operator notification routing.
 *
 * Sends the body to the member's bound operator channel — Telegram chat or
 * iMessage space — and persists the matching `OperatorContext` patch so the
 * inbound webhook can resolve `pendingPlan` / `pendingDigest` on the next
 * reply. Context is keyed the same way each channel's inbound handler keys it:
 * Telegram by `chatId`, iMessage by `senderId`.
 *
 * Notification policy:
 * - **critical** — plan approval prompts and escalations. Send failures throw
 *   `OperatorNotifyError` so BullMQ jobs retry; `provider_send` ops alerts are
 *   emitted from `telegram-client` and `spectrum` on each failed attempt.
 * - **best-effort** — digests, auto-execution summaries, webhook replies, and
 *   auto-ack. Failures are logged and the caller continues without throwing.
 */

import { db } from '@shopkeeper/db';
import logger from './logger.js';
import { isTelegramConfigured, sendMessage as telegramSend } from './clients/telegram-client.js';
import { isImessageConfigured, sendImessageToSpace } from './clients/spectrum.js';
import { stripMarkdown } from './message-handlers/strip-markdown.js';
import { updateContext, type OperatorContext } from './operator-context.js';
import { mirrorOperatorMessage } from './operator-thread-mirror.js';
import {
  markOperatorNotifyDelivered,
  wasOperatorNotifyDelivered,
} from './operator-notify-idempotency.js';

export type OperatorNotifyPolicy = 'critical' | 'best-effort';

export type OperatorBinding =
  | { channel: 'telegram'; chatId: string }
  | { channel: 'imessage'; senderId: string; spaceId: string };

export interface OperatorNotifyOptions {
  policy?: OperatorNotifyPolicy;
  threadId?: string | null;
  /** Stable per notification; skips re-send on BullMQ retry when already delivered to this channel. */
  idempotencyKey?: string | null;
}

export interface OperatorNotifyResult {
  channel: OperatorBinding['channel'];
  chatId: string;
}

export class OperatorNotifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'OperatorNotifyError';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

// Every operator-channel binding for an org, Telegram first. Callers fan
// notifications out to each entry via `notifyOperator`.
export async function listOperatorBindings(organizationId: string): Promise<OperatorBinding[]> {
  const [telegramChats, imessageBindings] = await Promise.all([
    db.orgMemberTelegramChat.findMany({
      where: { orgMember: { organizationId } },
      select: { chatId: true },
    }),
    db.orgMemberImessageBinding.findMany({
      where: { orgMember: { organizationId } },
      select: { senderId: true, spaceId: true },
    }),
  ]);

  return [
    ...telegramChats.map(({ chatId }): OperatorBinding => ({ channel: 'telegram', chatId })),
    ...imessageBindings.map(
      ({ senderId, spaceId }): OperatorBinding => ({ channel: 'imessage', senderId, spaceId }),
    ),
  ];
}

function isChannelConfigured(member: OperatorBinding): boolean {
  return member.channel === 'telegram' ? isTelegramConfigured() : isImessageConfigured();
}

// Returns false only for the Telegram client's soft-failure signal; iMessage
// sends signal failure by throwing.
async function sendToBinding(
  organizationId: string,
  member: OperatorBinding,
  body: string,
  options: OperatorNotifyOptions,
): Promise<boolean> {
  if (member.channel === 'telegram') {
    return telegramSend(member.chatId, body, {
      orgId: organizationId,
      threadId: options.threadId ?? null,
    });
  }
  await sendImessageToSpace(member.spaceId, stripMarkdown(body), {
    orgId: organizationId,
    threadId: options.threadId ?? null,
    spaceId: member.spaceId,
  });
  return true;
}

export async function notifyOperator(
  organizationId: string,
  member: OperatorBinding,
  body: string,
  contextPatch: Partial<OperatorContext>,
  options: OperatorNotifyOptions = {},
): Promise<OperatorNotifyResult | null> {
  const policy = options.policy ?? 'best-effort';
  const label = member.channel === 'telegram' ? 'Telegram' : 'iMessage';
  const contextKey = member.channel === 'telegram' ? member.chatId : member.senderId;

  if (!isChannelConfigured(member)) {
    if (policy === 'critical') {
      throw new OperatorNotifyError(`${label} not configured`);
    }
    return null;
  }

  const idempotencyKey = options.idempotencyKey ?? null;
  if (idempotencyKey && await wasOperatorNotifyDelivered(member.channel, contextKey, idempotencyKey)) {
    logger.info(
      {
        organizationId,
        channel: member.channel,
        chatId: contextKey,
        idempotencyKey,
        ...(options.threadId ? { threadId: options.threadId } : {}),
      },
      '[OperatorNotify] Duplicate delivery skipped',
    );
    await updateContext(organizationId, contextKey, contextPatch);
    return { channel: member.channel, chatId: contextKey };
  }

  try {
    const sent = await sendToBinding(organizationId, member, body, options);
    if (!sent) {
      if (policy === 'critical') {
        throw new OperatorNotifyError(`${label} send failed`);
      }
      logger.warn(
        { chatId: contextKey, channel: member.channel, organizationId },
        '[OperatorNotify] Send failed — skipping context update',
      );
      return null;
    }

    if (idempotencyKey) {
      await markOperatorNotifyDelivered(member.channel, contextKey, idempotencyKey);
    }

    // The push is part of the merchant's conversation — mirror it onto their
    // operator thread so the agent can see what a later reply refers to. The
    // duplicate-delivery branch above already mirrored on the original send.
    await mirrorOperatorMessage(organizationId, `${member.channel}:${contextKey}`, 'agent', body);

    await updateContext(organizationId, contextKey, contextPatch);
    return { channel: member.channel, chatId: contextKey };
  } catch (error) {
    if (policy === 'critical') {
      if (error instanceof OperatorNotifyError) {
        throw error;
      }
      throw new OperatorNotifyError(`${label} send failed`, { cause: error });
    }

    logger.error(
      { err: (error as Error).message, chatId: contextKey, channel: member.channel, organizationId },
      '[OperatorNotify] Send failed',
    );
    return null;
  }
}
