// Shared contract for the per-customer memory blob stored on
// `customers.memory`. Gateway writes it via the summarizer; dashboard reads
// it into the agent context and renders the editor UI.
//
// Bounding happens on write, not on read — a single bad summarizer call
// can't poison every future request because `boundMemory` runs before
// persisting.

export const CUSTOMER_MEMORY_VERSION = 1;

export const SUMMARY_MAX_CHARS = 500;
export const KEY_FACT_MAX_CHARS = 80;
export const KEY_FACTS_MAX = 10;
export const RECENT_INTERACTIONS_MAX = 10;
export const OUTCOME_MAX_CHARS = 120;

export interface CustomerMemoryPolicyFlags {
  vip?: boolean;
  complaintPattern?: boolean;
  priorRefundsTotal?: number;
  priorRefundsCount?: number;
}

export interface CustomerMemoryInteraction {
  threadId: string;
  channel: string;
  tag: string | null;
  closedAt: string;
  outcome: string;
}

export interface CustomerMemory {
  summary: string;
  keyFacts: string[];
  policyFlags: CustomerMemoryPolicyFlags;
  recentInteractions: CustomerMemoryInteraction[];
  version: number;
}

export const EMPTY_MEMORY: CustomerMemory = {
  summary: '',
  keyFacts: [],
  policyFlags: {},
  recentInteractions: [],
  version: CUSTOMER_MEMORY_VERSION,
};

function boundPolicyFlags(f: CustomerMemoryPolicyFlags): CustomerMemoryPolicyFlags {
  const out: CustomerMemoryPolicyFlags = {};
  if (typeof f.vip === 'boolean') out.vip = f.vip;
  if (typeof f.complaintPattern === 'boolean') out.complaintPattern = f.complaintPattern;
  if (typeof f.priorRefundsTotal === 'number' && Number.isFinite(f.priorRefundsTotal) && f.priorRefundsTotal >= 0) {
    out.priorRefundsTotal = f.priorRefundsTotal;
  }
  if (typeof f.priorRefundsCount === 'number' && Number.isFinite(f.priorRefundsCount) && f.priorRefundsCount >= 0) {
    out.priorRefundsCount = f.priorRefundsCount;
  }
  return out;
}

function boundInteraction(i: CustomerMemoryInteraction): CustomerMemoryInteraction {
  return {
    threadId: i.threadId,
    channel: i.channel,
    tag: i.tag,
    closedAt: i.closedAt,
    outcome: i.outcome.slice(0, OUTCOME_MAX_CHARS),
  };
}

export function boundMemory(m: CustomerMemory): CustomerMemory {
  return {
    summary: m.summary.slice(0, SUMMARY_MAX_CHARS),
    keyFacts: m.keyFacts
      .filter((f) => typeof f === 'string' && f.length > 0 && f.length <= KEY_FACT_MAX_CHARS)
      .slice(0, KEY_FACTS_MAX),
    policyFlags: boundPolicyFlags(m.policyFlags),
    recentInteractions: m.recentInteractions.slice(0, RECENT_INTERACTIONS_MAX).map(boundInteraction),
    version: m.version,
  };
}

export function isEmptyMemory(m: unknown): boolean {
  if (!m || typeof m !== 'object') return true;
  const mem = m as Partial<CustomerMemory>;
  const hasSummary = typeof mem.summary === 'string' && mem.summary.trim().length > 0;
  const hasFacts = Array.isArray(mem.keyFacts) && mem.keyFacts.length > 0;
  const hasInteractions = Array.isArray(mem.recentInteractions) && mem.recentInteractions.length > 0;
  const hasFlags =
    !!mem.policyFlags &&
    typeof mem.policyFlags === 'object' &&
    Object.values(mem.policyFlags).some((v) => v !== undefined && v !== false && v !== null);
  return !(hasSummary || hasFacts || hasInteractions || hasFlags);
}
