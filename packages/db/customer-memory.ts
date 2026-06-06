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

const INTERACTION_FIELD_MAX_CHARS = 120;

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
    threadId: i.threadId.slice(0, INTERACTION_FIELD_MAX_CHARS),
    channel: i.channel.slice(0, INTERACTION_FIELD_MAX_CHARS),
    tag: typeof i.tag === 'string' ? i.tag.slice(0, INTERACTION_FIELD_MAX_CHARS) : i.tag,
    closedAt: i.closedAt.slice(0, INTERACTION_FIELD_MAX_CHARS),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPolicyFlags(value: unknown): CustomerMemoryPolicyFlags {
  if (!isRecord(value)) return {};
  const flags: CustomerMemoryPolicyFlags = {};
  if (typeof value.vip === 'boolean') flags.vip = value.vip;
  if (typeof value.complaintPattern === 'boolean') flags.complaintPattern = value.complaintPattern;
  if (typeof value.priorRefundsTotal === 'number') flags.priorRefundsTotal = value.priorRefundsTotal;
  if (typeof value.priorRefundsCount === 'number') flags.priorRefundsCount = value.priorRefundsCount;
  return flags;
}

function readInteraction(value: unknown): CustomerMemoryInteraction | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.threadId !== 'string' ||
    typeof value.channel !== 'string' ||
    !(typeof value.tag === 'string' || value.tag === null) ||
    typeof value.closedAt !== 'string' ||
    typeof value.outcome !== 'string'
  ) {
    return null;
  }
  return {
    threadId: value.threadId,
    channel: value.channel,
    tag: value.tag,
    closedAt: value.closedAt,
    outcome: value.outcome,
  };
}

// Permissively parses a stored memory JSON blob back into the canonical shape
// and bounds it. Used by readers (dashboard route, agent context, gateway
// summarizer pre-call) — never throws, so a malformed historical row degrades
// to EMPTY_MEMORY rather than blowing up the request.
export function parseStoredMemory(value: unknown): CustomerMemory {
  if (isEmptyMemory(value) || !isRecord(value)) return EMPTY_MEMORY;

  return boundMemory({
    summary: typeof value.summary === 'string' ? value.summary : '',
    keyFacts: Array.isArray(value.keyFacts)
      ? value.keyFacts.filter((fact): fact is string => typeof fact === 'string')
      : [],
    policyFlags: readPolicyFlags(value.policyFlags),
    recentInteractions: Array.isArray(value.recentInteractions)
      ? value.recentInteractions
          .map(readInteraction)
          .filter((interaction): interaction is CustomerMemoryInteraction => interaction !== null)
      : [],
    version: CUSTOMER_MEMORY_VERSION,
  });
}

// CustomerMemory is already JSON-safe; round-trip through JSON to return the
// exact shape Prisma accepts for JSON fields.
export function toCustomerMemoryJson(value: CustomerMemory): import('@prisma/client').Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as import('@prisma/client').Prisma.InputJsonValue;
}
