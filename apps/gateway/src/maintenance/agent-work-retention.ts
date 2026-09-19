import type { Prisma as PrismaTypes } from '@prisma/client';
import { db, Prisma } from '@shopkeeper/db';

// Both regular and filtered-thread retention use the same durable-work guard.
// Explicit erasure requests follow the separate existing redaction policy.
export async function purgeRetainedAgentThreads(where: PrismaTypes.ThreadWhereInput): Promise<number> {
  const candidates = await db.thread.findMany({ where, select: { id: true, organizationId: true } });
  let count = 0;
  for (const candidate of candidates) {
    count += await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM threads WHERE id = ${candidate.id}::uuid
        AND organization_id = ${candidate.organizationId}::uuid FOR UPDATE
      `);
      const scope = { organizationId: candidate.organizationId, threadId: candidate.id };
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM agent_tasks WHERE organization_id = ${candidate.organizationId}::uuid
        AND thread_id = ${candidate.id}::uuid FOR UPDATE
      `);
      const eligible = await tx.thread.findFirst({
        where: {
          AND: [where, { id: candidate.id, organizationId: candidate.organizationId }],
          agentRequests: { none: { state: 'accepted' } },
          agentTasks: { none: {
            OR: [
              { status: { notIn: ['completed', 'failed', 'cancelled'] } },
              { actions: { some: { OR: [
                { dispatchState: { in: ['dispatch_authorized', 'submitted', 'unknown'] } },
                { status: 'unknown' },
              ] } } },
              { executions: { some: { status: { in: ['claimed', 'unknown'] } } } },
              { messages: { some: { sendStatus: { in: ['pending', 'sending', 'unknown', 'failed'] } } } },
            ],
          } },
        },
        select: { id: true },
      });
      if (!eligible) return 0;
      await tx.agentRequest.deleteMany({ where: scope });
      // Clear proposal links first: an action/execution may never retain a
      // proposal while its task link has already been removed.
      await tx.agentProposal.deleteMany({
        where: { organizationId: candidate.organizationId, task: { threadId: candidate.id } },
      });
      await tx.agentTask.deleteMany({ where: scope });
      return (await tx.thread.deleteMany({ where: { id: candidate.id, organizationId: candidate.organizationId } })).count;
    });
  }
  return count;
}
