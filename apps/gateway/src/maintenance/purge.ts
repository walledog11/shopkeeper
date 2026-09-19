import { ThreadFilterStatus, ThreadFilterFeedback } from '@shopkeeper/db';
import { purgeRetainedAgentThreads } from './agent-work-retention.js';
import { ONE_DAY_MS } from './registration.js';
export const FILTERED_PURGE_AFTER_DAYS = 7;

export async function purgeFilteredThreads(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - FILTERED_PURGE_AFTER_DAYS * ONE_DAY_MS);
  return purgeRetainedAgentThreads({
      filterStatus: ThreadFilterStatus.filtered,
      filterFeedback: ThreadFilterFeedback.none,
      filterDecidedAt: { lt: cutoff },
      messages: { none: { senderType: 'agent' } },
  });
}
