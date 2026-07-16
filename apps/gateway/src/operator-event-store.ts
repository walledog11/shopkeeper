import { randomUUID } from 'node:crypto';
import { db, Prisma } from '@shopkeeper/db';
import type { OperatorEvent, Prisma as PrismaTypes } from '@prisma/client';

// Durable operator-event store (P4-03). Backs the at-most-one-control-action
// guarantee for inbound operator messages: the webhook persists a row here
// before acknowledging, the worker claims it exactly once, and turn commit is
// tracked separately from reply delivery so a stuck confirmation can be re-sent
// without re-running the side-effectful turn.

export type OperatorEventChannel = 'telegram' | 'imessage';

export interface IngestOperatorEventParams {
  organizationId: string;
  channel: OperatorEventChannel;
  providerMessageId: string;
  chatId: string;
  spaceId?: string | null;
  clerkUserId: string;
  operatorKey: string;
  body: string;
  metadata?: PrismaTypes.InputJsonValue;
}

export interface IngestOperatorEventResult {
  event: OperatorEvent;
  // false when (channel, providerMessageId) already existed — a provider
  // redelivery. The caller must not enqueue a second job in that case.
  created: boolean;
}

// Persist one inbound operator message. Idempotent on (channel,
// providerMessageId): a redelivery returns the existing row with created=false.
export async function ingestOperatorEvent(
  params: IngestOperatorEventParams,
): Promise<IngestOperatorEventResult> {
  try {
    const event = await db.operatorEvent.create({
      data: {
        organizationId: params.organizationId,
        channel: params.channel,
        providerMessageId: params.providerMessageId,
        chatId: params.chatId,
        spaceId: params.spaceId ?? null,
        clerkUserId: params.clerkUserId,
        operatorKey: params.operatorKey,
        body: params.body,
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      },
    });
    return { event, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const event = await db.operatorEvent.findUnique({
        where: {
          channel_providerMessageId: {
            channel: params.channel,
            providerMessageId: params.providerMessageId,
          },
        },
      });
      if (event) return { event, created: false };
    }
    throw err;
  }
}

// Atomically move pending -> claimed. Returns the claimed row (with a fresh
// claim token) when this caller won, or null when the event is already claimed,
// terminal, or gone. Only the winner runs the turn.
export async function claimOperatorEvent(id: string): Promise<OperatorEvent | null> {
  const claimToken = randomUUID();
  const { count } = await db.operatorEvent.updateMany({
    where: { id, status: 'pending' },
    data: {
      status: 'claimed',
      claimToken,
      claimedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (count === 0) return null;
  return db.operatorEvent.findUnique({ where: { id } });
}

// claimed -> committed. Records the reply text so a later delivery retry can
// re-send it without re-running the turn. Guarded by the claim token so a stale
// worker cannot finalize an event a newer claim owns.
export async function finalizeOperatorEventCommitted(
  id: string,
  claimToken: string,
  replyText: string,
): Promise<void> {
  await db.operatorEvent.updateMany({
    where: { id, status: 'claimed', claimToken },
    data: { status: 'committed', processedAt: new Date(), replyText },
  });
}

// claimed -> failed. The turn threw after a possible side effect, so it is never
// auto-replayed; recovery reviews failed rows.
export async function finalizeOperatorEventFailed(
  id: string,
  claimToken: string,
  error: string,
): Promise<void> {
  await db.operatorEvent.updateMany({
    where: { id, status: 'claimed', claimToken },
    data: { status: 'failed', processedAt: new Date(), lastError: error.slice(0, 2000) },
  });
}

// Record that the committed turn's reply reached the provider. Delivery is
// independent of turn commit: a null replyDeliveredAt on a committed row is the
// recovery signal for a stuck confirmation. Guarded to `committed` so a row the
// sweep has since reconciled to `unknown` is never stamped delivered.
export async function markOperatorEventReplyDelivered(id: string): Promise<void> {
  await db.operatorEvent.updateMany({
    where: { id, status: 'committed' },
    data: { replyDeliveredAt: new Date() },
  });
}

// Recovery sweep: a claim whose worker died mid-turn stays `claimed` forever
// (the turn may have partially acted, so it is never auto-replayed). Reconcile
// claims older than the cutoff to `unknown` for human review. The terminal-state
// CHECK constraint requires processedAt set and the claim token kept, so this
// only advances the status. Returns how many rows were reconciled.
export async function reconcileStaleClaimedOperatorEvents(
  cutoff: Date,
  error: string,
): Promise<number> {
  const { count } = await db.operatorEvent.updateMany({
    where: { status: 'claimed', claimedAt: { lt: cutoff } },
    data: { status: 'unknown', processedAt: new Date(), lastError: error.slice(0, 2000) },
  });
  return count;
}

// Recovery sweep: committed turns whose confirmation never reached the provider.
// The processedAt cutoff keeps the sweep clear of the worker's own
// commit -> mark-delivered window so a just-committed reply is not double-sent.
export async function findCommittedUndeliveredOperatorEvents(
  cutoff: Date,
  limit: number,
): Promise<OperatorEvent[]> {
  return db.operatorEvent.findMany({
    where: {
      status: 'committed',
      replyDeliveredAt: null,
      replyText: { not: null },
      processedAt: { lt: cutoff },
    },
    orderBy: { processedAt: 'asc' },
    take: limit,
  });
}
