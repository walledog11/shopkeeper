import { randomUUID } from "node:crypto";
import type {
  ChannelType,
  PlanExecutionStatus,
  RequestEpisodeReplyProvenance,
  RequestEpisodeTerminalResolution,
  ThreadRequestDisposition,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime, db } from "@shopkeeper/db";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { decideAutonomy, type AutonomyKind } from "./autonomy.js";
import { parseClassifierSignals } from "./classifier-signals.js";
import type { OrgSettings } from "./types.js";
import type { AgentPlan } from "./types.js";

type ExecutionIntent = "automatic" | "merchant_approved";

export interface RequestEpisodeThreadSnapshot {
  id: string;
  customerId: string;
  channelType: ChannelType;
  tag: string | null;
  requestDisposition: ThreadRequestDisposition | null;
  classifierSignals: unknown;
  filterStatus?: string | null;
  escalatedAt?: Date | null;
}

export interface CaptureCommittedPlanOutcomeParams {
  orgId: string;
  thread: RequestEpisodeThreadSnapshot;
  sourceMessageId: string;
  planId: string;
  instruction: string;
  plan: AgentPlan;
  settings: OrgSettings;
  allowMutativeAutoExecute?: boolean;
  namespaceMiss?: boolean;
}

export interface RecordRequestEpisodeExecutionParams {
  orgId: string;
  planId: string;
  planExecutionId?: string | null;
  executionStatus: PlanExecutionStatus;
  executionIntent: ExecutionIntent;
  planVerdict: AutonomyKind;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === "P2002";
}

function classifierIntentsSnapshot(signals: ReturnType<typeof parseClassifierSignals>): Prisma.InputJsonValue | null {
  if (!signals) return null;
  return signals.intents as Prisma.InputJsonValue;
}

function milestoneTimestampsForVerdict(
  verdict: AutonomyKind,
  now: Date,
): {
  approvalRequestedAt: Date | null;
  merchantInputRequestedAt: Date | null;
  escalatedAt: Date | null;
  terminalResolution: RequestEpisodeTerminalResolution;
  terminalAt: Date | null;
} {
  const approvalRequestedAt = verdict === "needs_review" ? now : null;
  const merchantInputRequestedAt = verdict === "needs_merchant_input" ? now : null;
  const escalatedAt = verdict === "escalate" ? now : null;
  if (verdict === "invalid") {
    return {
      approvalRequestedAt,
      merchantInputRequestedAt,
      escalatedAt,
      terminalResolution: "invalid_plan",
      terminalAt: now,
    };
  }
  return {
    approvalRequestedAt,
    merchantInputRequestedAt,
    escalatedAt,
    terminalResolution: "unresolved",
    terminalAt: null,
  };
}

function terminalForExecution(params: RecordRequestEpisodeExecutionParams): {
  terminalResolution: RequestEpisodeTerminalResolution;
  replyProvenance: RequestEpisodeReplyProvenance | null;
  merchantTouched: boolean;
  approvalGrantedAt: Date | null;
} {
  const now = new Date();
  if (params.executionStatus === "unknown") {
    return {
      terminalResolution: "unresolved",
      replyProvenance: null,
      merchantTouched: false,
      approvalGrantedAt: null,
    };
  }
  if (params.executionStatus === "failed") {
    return {
      terminalResolution: "failed",
      replyProvenance: null,
      merchantTouched: params.executionIntent === "merchant_approved",
      approvalGrantedAt: params.executionIntent === "merchant_approved" ? now : null,
    };
  }
  if (params.planVerdict === "escalate") {
    return {
      terminalResolution: "escalated",
      replyProvenance: null,
      merchantTouched: params.executionIntent === "merchant_approved",
      approvalGrantedAt: params.executionIntent === "merchant_approved" ? now : null,
    };
  }
  if (params.executionIntent === "automatic") {
    return {
      terminalResolution: "auto_resolved",
      replyProvenance: "agent_automatic",
      merchantTouched: false,
      approvalGrantedAt: null,
    };
  }
  return {
    terminalResolution: "merchant_approved",
    replyProvenance: "agent_approved",
    merchantTouched: true,
    approvalGrantedAt: now,
  };
}

export async function captureCommittedPlanOutcome(
  params: CaptureCommittedPlanOutcomeParams,
): Promise<void> {
  const classifierSignals = parseClassifierSignals(params.thread.classifierSignals);
  const verdict = decideAutonomy(params.plan, params.settings, {
    filterStatus: params.thread.filterStatus,
    threadEscalated: Boolean(params.thread.escalatedAt),
    allowMutativeAutoExecute: params.allowMutativeAutoExecute,
  });
  await recordRequestEpisodePlanned({
    orgId: params.orgId,
    thread: params.thread,
    sourceMessageId: params.sourceMessageId,
    planId: params.planId,
    instruction: params.instruction,
    plan: params.plan,
    planVerdict: verdict.kind,
    classifierSignals,
    namespaceMiss: params.namespaceMiss ?? false,
  });
}

export async function recordRequestEpisodePlanned(params: {
  orgId: string;
  thread: RequestEpisodeThreadSnapshot;
  sourceMessageId: string;
  planId: string;
  instruction: string;
  plan: AgentPlan;
  planVerdict: AutonomyKind;
  classifierSignals: ReturnType<typeof parseClassifierSignals>;
  namespaceMiss?: boolean;
}): Promise<void> {
  const now = new Date();
  const milestones = milestoneTimestampsForVerdict(params.planVerdict, now);
  const data = {
    id: randomUUID(),
    organizationId: params.orgId,
    threadId: params.thread.id,
    customerId: params.thread.customerId,
    sourceMessageId: params.sourceMessageId,
    planId: params.planId,
    channelType: params.thread.channelType,
    classifierVersion: params.classifierSignals?.version ?? null,
    requestTag: params.thread.tag,
    requestDisposition: params.thread.requestDisposition,
    requestAsk: params.classifierSignals?.requestFacts.ask ?? null,
    classifierIntents: classifierIntentsSnapshot(params.classifierSignals) ?? PrismaRuntime.DbNull,
    planVerdict: params.planVerdict,
    planHash: hashPlan(params.plan),
    instructionHash: hashInstruction(params.instruction),
    namespaceMiss: params.namespaceMiss ?? false,
    approvalRequestedAt: milestones.approvalRequestedAt,
    merchantInputRequestedAt: milestones.merchantInputRequestedAt,
    escalatedAt: milestones.escalatedAt,
    terminalResolution: milestones.terminalResolution,
    terminalAt: milestones.terminalAt,
  };

  try {
    await db.$transaction(async (tx) => {
      if (milestones.terminalResolution === "unresolved") {
        await tx.requestEpisodeOutcome.updateMany({
          where: {
            organizationId: params.orgId,
            sourceMessageId: params.sourceMessageId,
            planId: { not: params.planId },
            terminalResolution: "unresolved",
          },
          data: {
            terminalResolution: "superseded",
            terminalAt: now,
            supersededByPlanId: params.planId,
          },
        });
      }
      await tx.requestEpisodeOutcome.create({ data });
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }
}

export async function recordRequestEpisodeExecution(
  params: RecordRequestEpisodeExecutionParams,
): Promise<void> {
  const terminal = terminalForExecution(params);
  if (terminal.terminalResolution === "unresolved") {
    await db.requestEpisodeOutcome.updateMany({
      where: {
        organizationId: params.orgId,
        planId: params.planId,
      },
      data: {
        planExecutionId: params.planExecutionId ?? null,
        executionStatus: params.executionStatus,
      },
    });
    return;
  }

  const now = new Date();
  await db.requestEpisodeOutcome.updateMany({
    where: {
      organizationId: params.orgId,
      planId: params.planId,
      terminalResolution: "unresolved",
    },
    data: {
      planExecutionId: params.planExecutionId ?? null,
      executionStatus: params.executionStatus,
      replyProvenance: terminal.replyProvenance,
      merchantTouched: terminal.merchantTouched,
      approvalGrantedAt: terminal.approvalGrantedAt,
      terminalResolution: terminal.terminalResolution,
      terminalAt: now,
    },
  });
}

export async function recordRequestEpisodeDismissed(params: {
  orgId: string;
  planId: string;
}): Promise<void> {
  const now = new Date();
  await db.requestEpisodeOutcome.updateMany({
    where: {
      organizationId: params.orgId,
      planId: params.planId,
      terminalResolution: "unresolved",
    },
    data: {
      terminalResolution: "dismissed",
      terminalAt: now,
    },
  });
}

export async function recordRequestEpisodeMerchantInputAnswered(params: {
  orgId: string;
  planId: string;
  answeredAt?: Date;
}): Promise<void> {
  const answeredAt = params.answeredAt ?? new Date();
  await db.requestEpisodeOutcome.updateMany({
    where: {
      organizationId: params.orgId,
      planId: params.planId,
    },
    data: {
      merchantInputAnsweredAt: answeredAt,
      merchantTouched: true,
    },
  });
}

export interface RequestOutcomeActionLogSnapshot {
  planId: string;
  sourceMessageId: string;
  planVerdict: string;
  terminalResolution: string;
  replyProvenance: RequestEpisodeReplyProvenance | null;
  requestTag: string | null;
  merchantInputAnsweredAt: Date | null;
}

export async function loadRequestOutcomesForExecutionIds(
  orgId: string,
  executionIds: string[],
): Promise<Map<string, RequestOutcomeActionLogSnapshot>> {
  const uniqueIds = [...new Set(executionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db.$queryRaw<Array<{
    executionId: string;
    planId: string;
    sourceMessageId: string;
    planVerdict: string;
    terminalResolution: string;
    replyProvenance: RequestEpisodeReplyProvenance | null;
    requestTag: string | null;
    merchantInputAnsweredAt: Date | null;
  }>>(PrismaRuntime.sql`
    SELECT
      pe.id AS "executionId",
      reo.plan_id AS "planId",
      reo.source_message_id AS "sourceMessageId",
      reo.plan_verdict AS "planVerdict",
      reo.terminal_resolution::text AS "terminalResolution",
      reo.reply_provenance AS "replyProvenance",
      reo.request_tag AS "requestTag",
      reo.merchant_input_answered_at AS "merchantInputAnsweredAt"
    FROM plan_executions pe
    JOIN request_episode_outcomes reo
      ON reo.organization_id = pe.organization_id
      AND reo.plan_id = pe.plan_id
    WHERE pe.organization_id = ${orgId}::uuid
      AND pe.id IN (${PrismaRuntime.join(uniqueIds.map((id) => PrismaRuntime.sql`${id}::uuid`))})
  `);

  return new Map(rows.map((row) => [row.executionId, {
    planId: row.planId,
    sourceMessageId: row.sourceMessageId,
    planVerdict: row.planVerdict,
    terminalResolution: row.terminalResolution,
    replyProvenance: row.replyProvenance,
    requestTag: row.requestTag,
    merchantInputAnsweredAt: row.merchantInputAnsweredAt,
  }]));
}
