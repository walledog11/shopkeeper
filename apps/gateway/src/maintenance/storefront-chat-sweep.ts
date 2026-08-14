import { db, utcDayString } from '@shopkeeper/db';
import { ONE_DAY_MS } from './registration.js';

/**
 * How long a dead storefront session is kept before it is hard-deleted.
 *
 * A session is already unusable the moment it expires — bootstrap only resumes
 * one whose `expiresAt` is in the future, and revocation is checked on every
 * message. The window is therefore not about function, it is about audit: if a
 * shopper disputes what the widget said, the session is the join between their
 * browser and the thread, and losing it the same day makes that unanswerable.
 * Ninety days matches the soft-delete purge alongside it.
 */
export const SESSION_PURGE_AFTER_DAYS = 90;

/**
 * How long per-shop daily counters are kept. They decide nothing after their own
 * UTC day closes — the budget only ever reads today's row — so this is retained
 * purely to answer "was yesterday's exhaustion a spike or a pattern". Without a
 * sweep it is one row per shop per day forever.
 */
export const DAILY_USAGE_RETAIN_DAYS = 90;

/**
 * Hard-delete storefront sessions that are dead and past their audit window.
 *
 * Deletes the session row only. The customer, thread and messages it points at
 * are held by their own retention rules and survive — a shopper's conversation
 * is a ticket like any other, and it must not disappear because the browser
 * identity behind it aged out. Verification rows cascade with the session, which
 * is the point at which the last code hash for that browser goes away.
 */
export async function purgeExpiredStorefrontChatSessions(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SESSION_PURGE_AFTER_DAYS * ONE_DAY_MS);
  const result = await db.storefrontChatSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { revokedAt: { lt: cutoff } },
      ],
    },
  });
  return result.count;
}

/**
 * Hard-delete per-shop daily message counters past their retention window.
 *
 * `day` is a `YYYY-MM-DD` string, so the comparison is lexicographic — which is
 * chronological for that format, and is why the column is stored this way rather
 * than as a timestamp.
 */
export async function purgeStorefrontChatDailyUsage(now: Date = new Date()): Promise<number> {
  const cutoffDay = utcDayString(new Date(now.getTime() - DAILY_USAGE_RETAIN_DAYS * ONE_DAY_MS));
  const result = await db.storefrontChatDailyUsage.deleteMany({
    where: { day: { lt: cutoffDay } },
  });
  return result.count;
}
