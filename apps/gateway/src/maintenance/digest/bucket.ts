import { ThreadFilterStatus } from '@shopkeeper/db';
import { FOUR_HOURS_MS, TWENTY_FOUR_HOURS_MS } from './constants.js';
import type { DigestBuckets, DigestThreadRow } from './types.js';

/**
 * `filedSince` scopes the spam count to work done since the last briefing.
 * Nothing ever closes a filtered thread — it is created open and sits there
 * until `purgeFilteredThreads` hard-deletes it a week later — so counting every
 * filtered thread still open is a running total, not a report. Said with "I
 * filed", a running total claims credit every morning for the same spam, and
 * ratchets up all week.
 */
export function bucketDigestThreads(
  threads: DigestThreadRow[],
  now: Date,
  filedSince: Date,
): DigestBuckets {
  const genuine: DigestThreadRow[] = [];
  const questionable: DigestThreadRow[] = [];
  let filteredCount = 0;
  const nowMs = now.getTime();
  let urgent = 0, stale = 0, fresh = 0;
  const tagCounts: Record<string, number> = {};

  for (const t of threads) {
    if (t.filterStatus === ThreadFilterStatus.questionable) {
      questionable.push(t);
      continue;
    }
    if (t.filterStatus === ThreadFilterStatus.filtered) {
      // An undecided timestamp is not evidence of recent work, so it does not
      // get claimed as any.
      if (t.filterDecidedAt && t.filterDecidedAt >= filedSince) filteredCount++;
      continue;
    }

    genuine.push(t);
    const age = nowMs - t.updatedAt.getTime();
    if (age > TWENTY_FOUR_HOURS_MS) urgent++;
    else if (age > FOUR_HOURS_MS) stale++;
    else fresh++;

    if (t.tag) tagCounts[t.tag] = (tagCounts[t.tag] ?? 0) + 1;
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(' · ');

  return { genuine, questionable, filteredCount, urgent, stale, fresh, topTags };
}
