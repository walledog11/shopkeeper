import type { DbThreadFilterStatus } from '@shopkeeper/db';
import type { PendingDigest } from '../../operator-context.js';
import type { BriefingItem } from '../digest-briefing/index.js';

export interface DigestThreadRow {
  id: string;
  updatedAt: Date;
  tag: string | null;
  channelType: string;
  filterStatus: DbThreadFilterStatus;
  filterDecidedAt: Date | null;
  aiTitle: string | null;
  escalatedAt: Date | null;
  requestSourceMessageId: string | null;
  customer: { name: string | null };
  // Orders a storefront shopper proved control of, joined on after the thread
  // query. Empty on every other channel.
  verifiedOrders?: readonly string[];
  // Exact customer message named by requestSourceMessageId. This is not the
  // latest-message lifecycle row below and is used only as a legacy rendering
  // fallback when the thread predates structured RequestFacts.
  pendingMessage?: string | null;
  // Lifecycle-state inputs. `messages` is the newest non-note message only, in
  // the same descending shape `loadStaleThreadWaitingItems` passes to
  // plan-cache helpers — those read the last conversational sender from the
  // same ordering contract.
  cachedPlan: unknown;
  cachedPlanMessageId: string | null;
  // `contentText` is here for the handoff section, which quotes the customer
  // rather than the classifier's paraphrase. Reading it off this row is only
  // sound because `blocked_no_plan` is defined by the customer holding the last
  // word, so for those threads this message is theirs.
  messages: Array<{ id: string; senderType: string; sentAt: Date; contentText: string | null }>;
  classifierSignals: unknown;
}

export interface DigestBuckets {
  genuine: DigestThreadRow[];
  questionable: DigestThreadRow[];
  filteredCount: number;
  urgent: number;
  stale: number;
  fresh: number;
  topTags: string;
}

export interface DigestMessageExtras {
  /** Greeting in the agent's own voice; the scheduled worker supplies it. */
  opener?: string | null;
  /** Everything that needs the merchant, in the order it is numbered. */
  needsYou?: BriefingItem[];
  /** What the agent did without them, as a sentence for the closing tail. */
  handledSection?: string | null;
  /** Proposed merchant preferences awaiting confirmation in Agent settings. */
  preferenceBriefingLine?: string | null;
  garnishLines?: string[];
}

export interface OrgDigest {
  message: string;
  pendingDigest: PendingDigest;
  flaggedCount: number;
}

export interface SendScheduledDigestsOptions {
  /** Restrict a sweep to known organizations, primarily for isolated integration runs. */
  organizationIds?: readonly string[];
}
