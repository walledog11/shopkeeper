import { NextResponse } from 'next/server';
import { db, Prisma, ThreadFilterStatus, ThreadFilterFeedback } from '@clerk/db';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { CHANNEL_TYPE, THREAD_STATUS } from '@/lib/messaging/thread-constants';
import { runPlaybooks } from '@/app/api/threads/_lib/playbook-runner';
import { enqueueCustomerMemoryForClosedThreads } from '@/lib/server/customer-memory';
import type { AgentTurnAction } from '@/lib/agent/api/turns';

export const GET = withOrgRoute<{ id: string }>(
  { context: 'Threads GET by id', errorMessage: 'Failed to fetch thread' },
  async ({ org, params }) => {
    const { id } = params;

    const thread = await db.thread.findFirst({
      where: {
        id,
        organizationId: org.id,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
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
    const body = await request.json();
    const { status, tag, shopifyCustomerId, filterStatus, filterFeedback } = body;

    if (!status && tag === undefined && shopifyCustomerId === undefined && filterStatus === undefined && filterFeedback === undefined) {
      throw new BadRequestError('Missing status, tag, shopifyCustomerId, filterStatus, or filterFeedback');
    }

    if (status && !Object.values(THREAD_STATUS).includes(status)) {
      throw new BadRequestError('Invalid status');
    }

    if (filterStatus !== undefined && !Object.values(ThreadFilterStatus).includes(filterStatus)) {
      throw new BadRequestError('Invalid filterStatus');
    }

    if (filterFeedback !== undefined && !Object.values(ThreadFilterFeedback).includes(filterFeedback)) {
      throw new BadRequestError('Invalid filterFeedback');
    }

    const thread = await db.thread.findUnique({
      where: { id },
      select: { organizationId: true, filterStatus: true },
    });
    assertEntityInOrg(thread, org.id, 'Thread not found');

    // Closing a questionable thread implies the merchant treated it as legit.
    const resolvedFeedback = filterFeedback
      ?? (status === THREAD_STATUS.CLOSED && thread.filterStatus === ThreadFilterStatus.questionable
            ? ThreadFilterFeedback.confirmed_genuine
            : undefined);

    const updated = await db.thread.update({
      where: { id },
      data: {
        ...(status && { status, cachedPlan: Prisma.DbNull, cachedPlanMessageId: null }),
        ...(tag !== undefined && { tag: tag || null }),
        ...(shopifyCustomerId !== undefined && { shopifyCustomerId: shopifyCustomerId || null }),
        ...(filterStatus !== undefined && { filterStatus }),
        ...(resolvedFeedback !== undefined && { filterFeedback: resolvedFeedback }),
      },
    });

    // Fire playbooks in background (never await — don't block the response)
    if (tag !== undefined && tag) {
      runPlaybooks(org.id, { type: 'tag_applied', tag }, id);
    }
    if (status === THREAD_STATUS.CLOSED) {
      await enqueueCustomerMemoryForClosedThreads({
        organizationId: org.id,
        threads: [{ threadId: id, closedAt: updated.updatedAt }],
      });
      runPlaybooks(org.id, { type: 'ticket_closed' }, id);
    }

    return NextResponse.json(updated);
  },
);
