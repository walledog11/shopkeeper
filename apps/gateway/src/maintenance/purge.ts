import { db, ThreadFilterStatus, ThreadFilterFeedback } from '@shopkeeper/db';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const FILTERED_PURGE_AFTER_DAYS = 7;

export async function purgeFilteredThreads(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - FILTERED_PURGE_AFTER_DAYS * ONE_DAY_MS);
  const result = await db.thread.deleteMany({
    where: {
      filterStatus: ThreadFilterStatus.filtered,
      filterFeedback: ThreadFilterFeedback.none,
      filterDecidedAt: { lt: cutoff },
      messages: { none: { senderType: 'agent' } },
    },
  });
  return result.count;
}
