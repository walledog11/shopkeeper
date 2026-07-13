import { createHash, randomUUID } from "node:crypto";
import { Prisma, db } from "@shopkeeper/db";
import type { AgentPlan } from "./types.js";
import { AGENT_PLAN_CACHE_VERSION, readAgentPlanCacheRecordShape } from "./plan-cache-shape.js";

export interface AgentPlanCacheRecord {
  version: number;
  planId: string | null;
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
    planId: randomUUID(),
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

  return params.cache.version === AGENT_PLAN_CACHE_VERSION
    && params.cache.instruction === params.instruction
    && params.cache.lastCustomerMessageId === params.lastCustomerMessageId
    && params.cache.settingsFingerprint === fingerprintSettings(params.settings)
    && params.cache.plan.steps.length > 0;
}

// Commit a generated plan only while its source customer message is still the
// latest non-note conversation message. The predicate and write share one SQL
// statement, so a newer inbound message cannot slip between a recheck and the
// cache update in another process.
export async function commitThreadPlanCacheIfCurrent(params: {
  orgId: string;
  threadId: string;
  sourceMessageId: string;
  cache: AgentPlanCacheRecord;
}): Promise<boolean> {
  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "threads" AS thread
    SET
      "cached_plan_message_id" = ${params.sourceMessageId}::uuid,
      "cached_plan" = ${JSON.stringify(params.cache)}::jsonb,
      "updated_at" = NOW()
    FROM "messages" AS source
    WHERE thread."id" = ${params.threadId}::uuid
      AND thread."organization_id" = ${params.orgId}::uuid
      AND source."id" = ${params.sourceMessageId}::uuid
      AND source."thread_id" = thread."id"
      AND source."organization_id" = thread."organization_id"
      AND source."deleted_at" IS NULL
      AND source."sender_type"::text = 'customer'
      AND NOT EXISTS (
        SELECT 1
        FROM "messages" AS newer
        WHERE newer."thread_id" = thread."id"
          AND newer."deleted_at" IS NULL
          AND newer."sender_type"::text <> 'note'
          AND (
            newer."sent_at" > source."sent_at"
            OR (newer."sent_at" = source."sent_at" AND newer."id" > source."id")
          )
      )
  `);
  return updated === 1;
}
