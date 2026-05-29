import { db, Prisma, SenderType, createMessage } from "@clerk/db";
import type { PlaybookAction, PlaybookTrigger } from "@/types";
import { dispatchMessage } from "@/lib/messaging/dispatch-message";
import logger from "@/lib/server/logger";
import { enqueueCustomerMemoryForClosedThreads } from "@/lib/server/customer-memory";

export async function runPlaybooks(
  orgId: string,
  trigger: PlaybookTrigger,
  threadId: string
): Promise<void> {
  try {
    const playbooks = await db.playbook.findMany({
      where: { organizationId: orgId, enabled: true },
    });

    const matching = playbooks.filter((playbook) => {
      const playbookTrigger = playbook.trigger as unknown as PlaybookTrigger;
      if (playbookTrigger.type !== trigger.type) return false;
      if (playbookTrigger.type === "tag_applied") return playbookTrigger.tag === trigger.tag;
      return true;
    });

    if (matching.length === 0) return;

    await Promise.all(matching.map(async (playbook) => {
      // Deduplicate: skip if this playbook already ran on this thread
      const run = await db.playbookRun.create({
        data: { playbookId: playbook.id, threadId },
      }).catch((e: { code?: string }) => {
        if (e.code === "P2002") return null;
        throw e;
      });
      if (!run) {
        logger.info({ playbookId: playbook.id, threadId }, "[playbook-runner] Already ran , skipping");
        continue;
      }

      await executePlaybook(orgId, threadId, playbook.actions as unknown as PlaybookAction[]);

      await db.playbook.update({
        where: { id: playbook.id },
        data: { runCount: { increment: 1 } },
      });
    }));
  } catch (error) {
    logger.error({ err: error }, "[playbook-runner] Failed to run playbooks");
  }
}

async function executePlaybook(
  orgId: string,
  threadId: string,
  actions: PlaybookAction[]
): Promise<void> {
  for (const action of actions) {
    try {
      if (action.type === "apply_tag") {
        await db.thread.update({ where: { id: threadId }, data: { tag: action.tag ?? null } });
      } else if (action.type === "close_ticket") {
        const updated = await db.thread.update({
          where: { id: threadId },
          data: { status: "closed", cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
          select: { updatedAt: true },
        });
        await enqueueCustomerMemoryForClosedThreads({
          organizationId: orgId,
          threads: [{ threadId, closedAt: updated.updatedAt }],
        });
      } else if (action.type === "add_note") {
        if (action.note) {
          await createMessage({ threadId, senderType: SenderType.note, contentText: action.note });
        }
      } else if (action.type === "send_reply") {
        if (!action.message) continue;

        const thread = await db.thread.findUnique({
          where: { id: threadId },
          include: { customer: true },
        });
        if (!thread) continue;

        const org = await db.organization.findUnique({ where: { id: orgId } });
        if (!org) continue;

        await dispatchMessage(thread, org, action.message);
      }
    } catch (error) {
      logger.error({ err: error, action }, "[playbook-runner] Action failed");
    }
  }
}
