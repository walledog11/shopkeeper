import { createHash, randomUUID } from "node:crypto";
import { Prisma, db } from "@shopkeeper/db";
import type { Prisma as PrismaTypes } from "@prisma/client";
import type { AgentPlan } from "./types.js";
import { AGENT_PLAN_CACHE_VERSION, readAgentPlanCacheRecordShape, type PlanFailureReplanContext } from "./plan-cache-shape.js";

export interface AgentPlanCacheRecord {
  version: number;
  planId: string | null;
  instruction: string;
  lastCustomerMessageId: string | null;
  settingsFingerprint: string;
  plan: AgentPlan;
  failureReplan?: PlanFailureReplanContext;
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
  const currentPlan: AgentPlan = { ...params.plan };
  delete currentPlan.routing;
  const plan: AgentPlan = {
    ...currentPlan,
    validation: params.plan.validation ?? { status: "valid", issues: [] },
    routingEvidence: params.plan.routingEvidence ?? {
      classifierState: "not_applicable",
      codes: [],
    },
  };
  return {
    version: AGENT_PLAN_CACHE_VERSION,
    planId: randomUUID(),
    instruction: params.instruction,
    lastCustomerMessageId: params.lastCustomerMessageId,
    settingsFingerprint: fingerprintSettings(params.settings),
    plan,
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
    && (
      params.cache.plan.steps.length > 0
      || params.cache.plan.validation?.status === "invalid"
    );
}

// Commit a generated plan only while its source is still the latest non-note
// conversation message, whoever sent it — or, for a source of null, while the
// thread has none. The predicate and write share one SQL statement, so a newer
// message cannot slip between a recheck and the cache update in another process.
export async function commitThreadPlanCacheIfCurrent(params: {
  orgId: string;
  threadId: string;
  sourceMessageId: string | null;
  cache: AgentPlanCacheRecord;
  taskClaim?: { taskId: string; expectedRevision: number; claimToken: string };
}, client: Pick<PrismaTypes.TransactionClient, "$executeRaw"> = db): Promise<boolean> {
  const claimHeld = params.taskClaim ? Prisma.sql`AND EXISTS (
    SELECT 1 FROM agent_tasks task
    WHERE task.id = ${params.taskClaim.taskId}::uuid
      AND task.organization_id = thread.organization_id AND task.thread_id = thread.id
      AND task.revision = ${params.taskClaim.expectedRevision}
      AND task.claim_token = ${params.taskClaim.claimToken}::uuid
      AND task.status = 'running' AND task.cancelled_at IS NULL
  )` : Prisma.empty;
  const conversation = Prisma.sql`
    newer."thread_id" = thread."id"
    AND newer."deleted_at" IS NULL
    AND newer."sender_type"::text <> 'note'`;
  const updated = params.sourceMessageId === null
    ? await client.$executeRaw(Prisma.sql`
        UPDATE "threads" AS thread
        SET
          "cached_plan_message_id" = NULL,
          "cached_plan" = ${JSON.stringify(params.cache)}::jsonb,
          "updated_at" = NOW()
        WHERE thread."id" = ${params.threadId}::uuid
          AND thread."organization_id" = ${params.orgId}::uuid
          ${claimHeld}
          AND NOT EXISTS (SELECT 1 FROM "messages" AS newer WHERE ${conversation})
      `)
    : await client.$executeRaw(Prisma.sql`
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
          AND source."sender_type"::text <> 'note'
          ${claimHeld}
          AND NOT EXISTS (
            SELECT 1
            FROM "messages" AS newer
            WHERE ${conversation}
              AND (
                newer."sent_at" > source."sent_at"
                OR (newer."sent_at" = source."sent_at" AND newer."id" > source."id")
              )
          )
      `);
  return updated === 1;
}
