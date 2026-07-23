import { db } from './index.js';

export type FollowUpWatchKind = 'refund' | 'exchange';
export type FollowUpWatchStatus = 'open' | 'notified' | 'skipped';

export interface RecordFollowUpWatchParams {
  organizationId: string;
  threadId: string | null;
  orderId: string;
  kind: FollowUpWatchKind;
}

// Recorded at tool-success time on a support thread. One row per (org, order):
// if the same order is refunded and later exchanged, the first watch owns the
// follow-up and a terminal status is never reopened.
export async function recordFollowUpWatch(params: RecordFollowUpWatchParams): Promise<void> {
  await db.followUpWatch.upsert({
    where: {
      organizationId_orderId: {
        organizationId: params.organizationId,
        orderId: params.orderId,
      },
    },
    create: {
      organizationId: params.organizationId,
      threadId: params.threadId,
      orderId: params.orderId,
      kind: params.kind,
    },
    update: {
      threadId: params.threadId ?? undefined,
    },
  });
}

export interface FollowUpWatchCandidate {
  id: string;
  organizationId: string;
  orderId: string;
  kind: FollowUpWatchKind;
  createdAt: Date;
  settings: unknown;
  customerName: string | null;
}

// Sweep input: open watches whose source ticket is closed on a customer-facing
// channel (never the operator/internal threads). Age gating against the
// configured window is applied per-org by the caller, since the window is a
// per-org setting.
export async function listOpenFollowUpWatchCandidates(limit = 100): Promise<FollowUpWatchCandidate[]> {
  const rows = await db.followUpWatch.findMany({
    where: {
      status: 'open',
      thread: {
        status: 'closed',
        archivedAt: null,
        deletedAt: null,
        channelType: { notIn: ['sms_agent', 'dashboard_agent'] },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      organizationId: true,
      orderId: true,
      kind: true,
      createdAt: true,
      organization: { select: { settings: true } },
      thread: { select: { customer: { select: { name: true } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    orderId: row.orderId,
    kind: row.kind,
    createdAt: row.createdAt,
    settings: row.organization.settings,
    customerName: row.thread?.customer?.name ?? null,
  }));
}

export function isTerminalFollowUpWatchStatus(status: FollowUpWatchStatus): boolean {
  return status === 'notified' || status === 'skipped';
}

export async function markFollowUpWatchNotified(
  watchId: string,
  organizationId: string,
): Promise<boolean> {
  const updated = await db.followUpWatch.updateMany({
    where: { id: watchId, organizationId, status: 'open' },
    data: { status: 'notified', notifiedAt: new Date() },
  });
  return updated.count === 1;
}

export async function markFollowUpWatchSkipped(
  watchId: string,
  organizationId: string,
): Promise<boolean> {
  const updated = await db.followUpWatch.updateMany({
    where: { id: watchId, organizationId, status: 'open' },
    data: { status: 'skipped' },
  });
  return updated.count === 1;
}
