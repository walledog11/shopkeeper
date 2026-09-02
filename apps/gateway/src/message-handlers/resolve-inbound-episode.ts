import type { Prisma as PrismaTypes } from '@prisma/client';
import { db, Prisma, SenderType, type DbChannelType, type DbThreadFilterStatus } from '@shopkeeper/db';
import { THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import { CHANNEL } from '../constants.js';

// Derived from the app's own client rather than `Prisma.TransactionClient`: the
// exported `db` is `$extends`ed (transparent token encryption), and the base
// Prisma transaction type is not assignable to the extended one.
type EpisodeTransactionClient = Omit<
  typeof db,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// One Thread is one conversation episode. This module owns the only place that
// decides whether an inbound message continues the current episode or starts a
// new one, and the decision is deterministic: status, provider conversation
// identity, and elapsed conversational inactivity. No model input, ever.

export type EpisodeRolloverReason = 'idle' | 'provider_conversation_changed';

interface ChannelEpisodePolicy {
  idleMs: number;
  // Whether a change of provider conversation id forces a new episode. Only
  // meaningful where ingestion actually records one (Thread.externalSpaceId).
  providerConversationScoped: boolean;
}

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

// Code-owned defaults, deliberately not merchant settings — there is no observed
// traffic to tune against yet.
//
// Channels absent from this map never roll over, and that is a decision rather
// than an omission. Operator channels (sms_agent, dashboard_agent, imessage) are
// one durable thread per binding, so a boundary there would fragment the
// merchant's own conversation. `shopify` is merchant-side order/email-fallback
// traffic, and `sms` is retired. Boundaries are specified for exactly the four
// customer-origin channels below; inventing one for the rest would be policy
// nobody asked for.
const CHANNEL_EPISODE_POLICY: Partial<Record<DbChannelType, ChannelEpisodePolicy>> = {
  [CHANNEL.SHOPIFY_CHAT]: { idleMs: HOURS_24, providerConversationScoped: false },
  [CHANNEL.IG_DM]: { idleMs: HOURS_24, providerConversationScoped: false },
  [CHANNEL.TIKTOK]: { idleMs: HOURS_24, providerConversationScoped: true },
  // Email has no stable provider conversation key in normalized ingestion yet,
  // so today it always falls back to the 7-day idle boundary. The flag is set so
  // that adding the key is the only change required.
  [CHANNEL.EMAIL]: { idleMs: DAYS_7, providerConversationScoped: true },
};

export function episodePolicyFor(channelType: DbChannelType): ChannelEpisodePolicy | null {
  return CHANNEL_EPISODE_POLICY[channelType] ?? null;
}

export interface ResolveInboundEpisodeInput {
  organizationId: string;
  customerId: string;
  channelType: DbChannelType;
  // A provider event the customer did not write. A note is not a conversation
  // turn, so it can neither start an episode nor end one.
  synthetic: boolean;
  providerConversationId: string | null;
  // Storefront chat only: the browser session this message arrived on, so the
  // episode is bound in the same transaction that creates it.
  storefrontSessionId: string | null;
  now: Date;
  newThreadData: NewEpisodeThreadData;
}

// Spelled out rather than derived from `ThreadUncheckedCreateInput` so the set
// of things an episode may be seeded with is visible here. Identity and
// lifecycle columns are owned by this module and deliberately absent.
export interface NewEpisodeThreadData {
  subject?: string;
  externalSpaceId?: string;
  tag?: string;
  lastMessageAt?: Date;
  aiTitle?: string;
  aiSummary?: string;
  filterStatus?: DbThreadFilterStatus;
  filterReason?: string;
  filterDecidedAt?: Date;
  classifierSignals?: PrismaTypes.InputJsonValue;
}

export interface ResolveInboundEpisodeResult {
  thread: { id: string; organizationId: string; customerId: string; externalSpaceId: string | null };
  isNew: boolean;
  rolledOverFromThreadId: string | null;
  rolloverReason: EpisodeRolloverReason | null;
}

// The conversational clock. Notes are excluded: a Shopify order webhook or an
// agent turn transcript landing on a quiet thread must not make it look alive.
// StorefrontChatSession.lastSeenAt is deliberately not consulted anywhere — it
// is browser activity, written on every widget open, and using it would keep an
// episode alive for a shopper who only ever re-opened the tab.
async function lastConversationalActivity(
  tx: EpisodeTransactionClient,
  threadId: string,
  fallback: Date,
): Promise<Date> {
  const latest = await tx.message.findFirst({
    where: { threadId, senderType: { not: SenderType.note }, deletedAt: null },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  return latest?.sentAt ?? fallback;
}

function rolloverReasonFor(params: {
  policy: ChannelEpisodePolicy;
  providerConversationId: string | null;
  threadExternalSpaceId: string | null;
  idleMs: number;
}): EpisodeRolloverReason | null {
  const { policy, providerConversationId, threadExternalSpaceId, idleMs } = params;
  if (
    policy.providerConversationScoped
    && providerConversationId
    && threadExternalSpaceId
    && providerConversationId !== threadExternalSpaceId
  ) {
    return 'provider_conversation_changed';
  }
  return idleMs >= policy.idleMs ? 'idle' : null;
}

async function bindStorefrontEpisode(
  tx: EpisodeTransactionClient,
  params: { organizationId: string; sessionId: string | null; threadId: string },
): Promise<void> {
  if (!params.sessionId) return;
  // Idempotent: a retried inbound must not append a second episode for a thread
  // the session already holds.
  await tx.storefrontChatSessionEpisode.upsert({
    where: {
      sessionId_threadId: { sessionId: params.sessionId, threadId: params.threadId },
    },
    update: {},
    create: {
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      threadId: params.threadId,
    },
  });
}

/**
 * Resolves which episode an inbound message belongs to, closing the expired one
 * and opening its successor when a boundary has elapsed.
 *
 * Must be called inside an interactive transaction. It takes a row lock on the
 * customer first: the previous `findFirst → create → catch P2002` sequence could
 * not survive two concurrent first-messages after expiry, because both would see
 * no open thread, both would close the old episode, and the partial unique index
 * would reject the loser only *after* it had already done so.
 */
export async function resolveInboundEpisode(
  tx: EpisodeTransactionClient,
  input: ResolveInboundEpisodeInput,
): Promise<ResolveInboundEpisodeResult> {
  const {
    organizationId,
    customerId,
    channelType,
    synthetic,
    providerConversationId,
    storefrontSessionId,
    now,
    newThreadData,
  } = input;

  // Serializes every episode decision for this customer. Held until commit.
  await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;

  const openThread = await tx.thread.findFirst({
    where: { organizationId, customerId, status: THREAD_STATUS.OPEN, channelType },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      externalSpaceId: true,
      lastMessageAt: true,
    },
  });

  const createEpisode = async (): Promise<ResolveInboundEpisodeResult['thread']> => {
    const created = await tx.thread.create({
      data: {
        organizationId,
        customerId,
        channelType,
        status: THREAD_STATUS.OPEN,
        ...newThreadData,
      },
      select: { id: true, organizationId: true, customerId: true, externalSpaceId: true },
    });
    await bindStorefrontEpisode(tx, {
      organizationId,
      sessionId: storefrontSessionId,
      threadId: created.id,
    });
    return created;
  };

  // A closed thread is simply not found, which is already a new episode — the
  // "thread is closed" row of the boundary table needs no separate branch.
  if (!openThread) {
    return {
      thread: await createEpisode(),
      isNew: true,
      rolledOverFromThreadId: null,
      rolloverReason: null,
    };
  }

  const policy = episodePolicyFor(channelType);
  const continueCurrent = async (): Promise<ResolveInboundEpisodeResult> => {
    await bindStorefrontEpisode(tx, {
      organizationId,
      sessionId: storefrontSessionId,
      threadId: openThread.id,
    });
    return {
      thread: openThread,
      isNew: false,
      rolledOverFromThreadId: null,
      rolloverReason: null,
    };
  };

  if (synthetic || !policy) return continueCurrent();

  const activeAt = await lastConversationalActivity(tx, openThread.id, openThread.lastMessageAt);
  const reason = rolloverReasonFor({
    policy,
    providerConversationId,
    threadExternalSpaceId: openThread.externalSpaceId,
    idleMs: now.getTime() - activeAt.getTime(),
  });

  if (!reason) return continueCurrent();

  // Hard rollover. The expired episode's cached plan dies with it — an old plan
  // was written from context that no longer applies, and copying one forward is
  // exactly the confusion this whole phase exists to stop. Genuinely unresolved
  // work survives as a CustomerObligation instead (P5); there is no such record
  // yet, which is why nothing is carried today.
  await tx.thread.update({
    where: { id: openThread.id },
    data: {
      status: THREAD_STATUS.CLOSED,
      closedReason: 'episode_rollover',
      cachedPlan: Prisma.DbNull,
      cachedPlanMessageId: null,
    },
  });
  if (storefrontSessionId) {
    await tx.storefrontChatSessionEpisode.updateMany({
      where: { sessionId: storefrontSessionId, threadId: openThread.id, endedAt: null },
      data: { endedAt: now },
    });
  }

  return {
    thread: await createEpisode(),
    isNew: true,
    rolledOverFromThreadId: openThread.id,
    rolloverReason: reason,
  };
}
