import { db, Prisma, SenderType } from '@clerk/db';
import { dispatchMessage } from './dispatch-message';
import logger from './logger';
import type { PlaybookTrigger, PlaybookAction } from '@/types';

/**
 * Runs all enabled playbooks matching the given trigger for an org.
 * Called after thread tag or status changes.
 * Errors are logged but never thrown — playbooks should not break the main flow.
 */
export async function runPlaybooks(
  orgId: string,
  trigger: PlaybookTrigger,
  threadId: string
): Promise<void> {
  try {
    const playbooks = await db.playbook.findMany({
      where: { organizationId: orgId, enabled: true },
    });

    const matching = playbooks.filter(pb => {
      const t = pb.trigger as unknown as PlaybookTrigger;
      if (t.type !== trigger.type) return false;
      if (t.type === 'tag_applied') return t.tag === trigger.tag;
      return true;
    });

    if (matching.length === 0) return;

    for (const playbook of matching) {
      await executePlaybook(orgId, threadId, playbook.actions as unknown as PlaybookAction[]);
    }
  } catch (err) {
    logger.error({ err }, '[playbook-runner] Failed to run playbooks');
  }
}

async function executePlaybook(
  orgId: string,
  threadId: string,
  actions: PlaybookAction[]
): Promise<void> {
  for (const action of actions) {
    try {
      if (action.type === 'apply_tag') {
        await db.thread.update({ where: { id: threadId }, data: { tag: action.tag ?? null } });

      } else if (action.type === 'close_ticket') {
        await db.thread.update({
          where: { id: threadId },
          data: { status: 'closed', cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
        });

      } else if (action.type === 'add_note') {
        if (action.note) {
          await db.message.create({
            data: { threadId, senderType: SenderType.note, contentText: action.note },
          });
        }

      } else if (action.type === 'send_reply') {
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
    } catch (err) {
      logger.error({ err, action }, '[playbook-runner] Action failed');
    }
  }
}
