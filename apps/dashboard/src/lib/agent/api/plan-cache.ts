import { createHash } from "node:crypto";
import type { AgentPlan } from "@/types";
import { AGENT_PLAN_CACHE_VERSION, readAgentPlanCacheRecordShape } from "@/lib/agent/plan-cache-shape";

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
  return readAgentPlanCacheRecordShape(value);
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
