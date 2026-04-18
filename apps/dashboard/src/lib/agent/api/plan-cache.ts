import { createHash } from "node:crypto";
import type { AgentPlan } from "@/types";

const AGENT_PLAN_CACHE_VERSION = 2;

export interface AgentPlanCacheRecord {
  version: number;
  instruction: string;
  lastCustomerMessageId: string | null;
  settingsFingerprint: string;
  plan: AgentPlan;
}

function fingerprintSettings(settings: unknown): string {
  return createHash("sha256").update(JSON.stringify(settings ?? null)).digest("hex");
}

export function buildAgentPlanCacheRecord(params: {
  instruction: string;
  lastCustomerMessageId: string | null;
  settings: unknown;
  plan: AgentPlan;
}): AgentPlanCacheRecord {
  return {
    version: AGENT_PLAN_CACHE_VERSION,
    instruction: params.instruction,
    lastCustomerMessageId: params.lastCustomerMessageId,
    settingsFingerprint: fingerprintSettings(params.settings),
    plan: params.plan,
  };
}

export function readAgentPlanCache(value: unknown): AgentPlanCacheRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AgentPlanCacheRecord>;
  if (
    candidate.version !== AGENT_PLAN_CACHE_VERSION ||
    typeof candidate.instruction !== "string" ||
    typeof candidate.settingsFingerprint !== "string" ||
    !candidate.plan ||
    typeof candidate.plan !== "object"
  ) {
    return null;
  }

  return {
    version: candidate.version,
    instruction: candidate.instruction,
    lastCustomerMessageId: typeof candidate.lastCustomerMessageId === "string" ? candidate.lastCustomerMessageId : null,
    settingsFingerprint: candidate.settingsFingerprint,
    plan: candidate.plan as AgentPlan,
  };
}

export function isAgentPlanCacheHit(params: {
  cache: AgentPlanCacheRecord | null;
  instruction: string;
  lastCustomerMessageId: string | null;
  settings: unknown;
}): boolean {
  if (!params.cache) {
    return false;
  }

  return params.cache.instruction === params.instruction
    && params.cache.lastCustomerMessageId === params.lastCustomerMessageId
    && params.cache.settingsFingerprint === fingerprintSettings(params.settings)
    && params.cache.plan.steps.length > 0;
}
