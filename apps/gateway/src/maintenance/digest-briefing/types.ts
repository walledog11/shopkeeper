import type { RequestFacts } from '@shopkeeper/agent/classifier-signals';

export interface HandledRollup {
  approvedCount: number;
  autoCount: number;
  replyCount: number;
  refundCount: number;
  notableLines: string[];
}

export interface WaitingItem {
  dedupeKey: string;
  threadId: string;
  line: string;
  /** Links the briefing ordinal back to its entry in the operator plan queue. */
  planId?: string;
  /** What the briefing orders on. Null when the classifier read no facts. */
  requestFacts: RequestFacts | null;
  /** False keeps the plan parked but prevents a blind approval prompt. */
  needsThreadReview: boolean;
}

export interface BriefingTicketRow {
  aiTitle?: string | null;
  channelType?: string | null;
  customer: { name: string | null };
  /** Source customer text for the sections that quote rather than paraphrase it. */
  pendingMessage?: string | null;
  /** Orders this storefront shopper proved control of. Empty for every other channel. */
  verifiedOrders?: readonly string[];
  /** Raw `Thread.classifierSignals`. Carries `requestFacts` from version 5 on. */
  classifierSignals?: unknown;
}

/**
 * One entry in the single numbered list the briefing prints.
 *
 * The four sections this replaced were named after the agent's own bookkeeping —
 * has a plan / has no plan / plan not stale yet / classifier was unsure — and
 * each got its own heading, its own numbering and its own closing question. A
 * merchant with seven things to do read four lists, two of them starting at "1.",
 * and three different asks. "1 yes" named two different tickets.
 *
 * They are one list now, in one order, because the merchant has one job: get
 * through the things that need them. `kind` survives only to say what a number
 * *does* when it is used, and to group the ones a bare yes can clear.
 */
export interface BriefingItem {
  threadId: string;
  kind: 'approval' | 'decision' | 'flagged';
  planId?: string;
  /** Keep the underlying action identity while requiring the thread be opened. */
  needsThreadReview?: boolean;
  /** Rendered without its number; the list owns the numbering. */
  line: string;
}
