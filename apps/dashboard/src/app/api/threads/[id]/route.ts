import { NextResponse } from 'next/server';
import { db, Prisma, ThreadFilterStatus, ThreadFilterFeedback } from '@shopkeeper/db';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { merchantInboxInternalChannelFilter } from '@shopkeeper/agent/merchant-inbox-surfaces';
import { stopWaitingTasksOnClosedThreads } from '@shopkeeper/agent/task-ledger';
import { THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import { parseThreadPatchBody } from '@/app/api/threads/_lib/validation';
import type { AgentTurnAction } from '@shopkeeper/agent/turns';

export const GET = withOrgRoute<{ id: string }>(
  { context: 'Threads GET by id', errorMessage: 'Failed to fetch thread' },
  async ({ org, params }) => {
    const { id } = params;

    const thread = await db.thread.findFirst({
      where: {
        id,
        organizationId: org.id,
        channelType: merchantInboxInternalChannelFilter(),
        archivedAt: null,
        deletedAt: null,
      },
      include: {
        customer: true,
        messages: {
          where: { deletedAt: null },
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    if (!thread) throw new NotFoundError('Thread not found');

    // Hydrate per-action records for inline display in the agent-turn notes.
    // New turns omit the actions array from note JSON; AgentAction is the
    // canonical record. Legacy turns keep their embedded actions and skip
    // the map entry (their note has no `id` to key on).
    const actionRows = await db.agentAction.findMany({
      where: { organizationId: org.id, threadId: id },
      select: { turnId: true, tool: true, output: true, errorDetail: true, status: true },
      orderBy: { executedAt: 'asc' },
    });
    const agentActionsByTurnId: Record<string, AgentTurnAction[]> = {};
    for (const row of actionRows) {
      const action: AgentTurnAction = {
        tool: row.tool,
        result: row.errorDetail ?? row.output ?? '',
        status: row.status as AgentTurnAction['status'],
      };
      (agentActionsByTurnId[row.turnId] ??= []).push(action);
    }

    return NextResponse.json({ thread, agentActionsByTurnId });
  },
);

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'Threads PATCH', errorMessage: 'Failed to update thread' },
  async ({ org, request, params }) => {
    const { id } = params;
    const { status, tag, shopifyCustomerId, filterStatus, filterFeedback } =
      parseThreadPatchBody(await readRequiredJsonObject(request));

    const thread = await db.thread.findUnique({
      where: { id },
      select: { organizationId: true, filterStatus: true, customerId: true, channelType: true },
    });
    assertEntityInOrg(thread, org.id, 'Thread not found');

    // Closing a questionable thread implies the merchant treated it as legit.
    const resolvedFeedback = filterFeedback
      ?? (status === THREAD_STATUS.CLOSED && thread.filterStatus === ThreadFilterStatus.questionable
            ? ThreadFilterFeedback.confirmed_genuine
            : undefined);

    const updated = await db.$transaction(async (tx) => {
      // One open thread per customer per channel (threads_one_open_per_customer).
      // Lock the customer row as inbound episode resolution does, so an arriving
      // message cannot open one between this check and the update.
      if (status === THREAD_STATUS.OPEN) {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${thread.customerId}::uuid FOR UPDATE`;
        const openThread = await tx.thread.findFirst({
          where: {
            organizationId: org.id,
            customerId: thread.customerId,
            channelType: thread.channelType,
            status: THREAD_STATUS.OPEN,
            id: { not: id },
          },
          select: { id: true },
        });
        if (openThread) {
          throw new ConflictError(
            'This customer already has an open conversation on this channel. Close it to reopen this one.',
          );
        }
      }
      const row = await tx.thread.update({
        where: { id },
        data: {
          ...(status && { status, cachedPlan: Prisma.DbNull, cachedPlanMessageId: null }),
          ...(tag !== undefined && { tag }),
          ...(shopifyCustomerId !== undefined && { shopifyCustomerId }),
          ...(filterStatus !== undefined && { filterStatus }),
          ...(resolvedFeedback !== undefined && { filterFeedback: resolvedFeedback }),
        },
      });
      if (status === THREAD_STATUS.CLOSED) {
        await stopWaitingTasksOnClosedThreads(tx, { organizationId: org.id, threadIds: [id] });
      }
      return row;
    });

    return NextResponse.json(updated);
  },
);
