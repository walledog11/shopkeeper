import { createHash, randomUUID } from "node:crypto";
import { db } from "@clerk/db";
import { TOOL_CATEGORIES } from "@clerk/agent/tools";
import { resolveAgentSettings } from "@clerk/agent/settings";
import logger from "@/lib/server/logger";
import type { AgentPlan, OrgSettings, RawToolCall } from "@/types";

// Hash of the mutation set a plan would auto-execute, so a recorded shadow
// proposal can be compared against what the human ultimately executed. Order
// the agent emitted tools in is preserved; non-mutation tools (replies, reads)
// are excluded so a reworded reply does not read as a disagreement.
export function hashMutationCalls(toolCalls: RawToolCall[]): string {
  const mutations = toolCalls
    .filter((tc) => TOOL_CATEGORIES[tc.name] === "action")
    .map((tc) => ({ name: tc.name, input: tc.input }));
  return createHash("sha256").update(JSON.stringify(mutations)).digest("hex");
}

function mutationCount(toolCalls: RawToolCall[]): number {
  return toolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action").length;
}

function mutationToolNames(toolCalls: RawToolCall[]): string[] {
  return Array.from(
    new Set(toolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action").map((tc) => tc.name)),
  );
}

// Records what the agent would have auto-executed for this plan while the org is
// in shadow mode. Nothing fires; the row is a counterfactual resolved later when
// the human acts on the plan. Idempotent per (thread, proposed mutation set) so a
// re-plan on the same cached plan does not create duplicate pending rows.
export async function recordShadowDecision(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  plan: AgentPlan;
}): Promise<void> {
  const proposedMutationsHash = hashMutationCalls(params.plan.rawToolCalls);
  const tier = resolveAgentSettings(params.settings).autonomyTier ?? "guarded";

  const existing = await db.autonomyShadowDecision.findFirst({
    where: {
      organizationId: params.orgId,
      threadId: params.threadId,
      humanDecision: "pending",
      proposedMutationsHash,
    },
    select: { id: true },
  });
  if (existing) return;

  await db.autonomyShadowDecision.create({
    data: {
      turnId: randomUUID(),
      organizationId: params.orgId,
      threadId: params.threadId,
      tier,
      proposedMutationsHash,
      proposedTools: mutationToolNames(params.plan.rawToolCalls),
      wouldAutoExecute: true,
    },
  });

  logger.info({
    orgId: params.orgId,
    threadId: params.threadId,
    tier,
    proposedMutationsHash,
  }, "[autonomy-shadow] recorded counterfactual");
}

// Resolves the thread's pending shadow decision against what the human approved.
// Agreement = the human executed exactly the proposed mutation set. Executing a
// different set is an edit; executing no mutations (reply/escalate only) is a
// rejection of the proposed auto-action — the dangerous cell to drive toward ~0.
export async function resolveShadowDecisionOnApproval(params: {
  orgId: string;
  threadId: string;
  approvedToolCalls: RawToolCall[];
}): Promise<void> {
  const pending = await db.autonomyShadowDecision.findFirst({
    where: {
      organizationId: params.orgId,
      threadId: params.threadId,
      humanDecision: "pending",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, proposedMutationsHash: true },
  });
  if (!pending) return;

  let humanDecision: "approved_unchanged" | "edited" | "rejected";
  if (mutationCount(params.approvedToolCalls) === 0) {
    humanDecision = "rejected";
  } else if (hashMutationCalls(params.approvedToolCalls) === pending.proposedMutationsHash) {
    humanDecision = "approved_unchanged";
  } else {
    humanDecision = "edited";
  }

  await db.autonomyShadowDecision.update({
    where: { id: pending.id },
    data: {
      humanDecision,
      agreement: humanDecision === "approved_unchanged",
      resolvedAt: new Date(),
    },
  });

  logger.info({
    orgId: params.orgId,
    threadId: params.threadId,
    humanDecision,
  }, "[autonomy-shadow] resolved counterfactual");
}

interface ReadinessSlice {
  resolved: number;
  agreements: number;
  agreementRate: number | null;
  // Would-have-auto-executed but the human rejected it — the cell to drive to ~0.
  dangerousRejections: number;
}

export interface AutonomyReadiness extends ReadinessSlice {
  windowSize: number;
  pending: number;
  byTier: (ReadinessSlice & { tier: string })[];
  byTool: (ReadinessSlice & { tool: string })[];
}

function rate(agreements: number, resolved: number): number | null {
  return resolved === 0 ? null : agreements / resolved;
}

// Agreement over the last N resolved shadow decisions, split by tier and tool.
// This is what's watched before flipping autoExecuteMode shadow → live.
export async function getAutonomyReadiness(params: {
  orgId: string;
  windowSize?: number;
}): Promise<AutonomyReadiness> {
  const windowSize = params.windowSize ?? 200;

  const [rows, pending] = await Promise.all([
    db.autonomyShadowDecision.findMany({
      where: { organizationId: params.orgId, humanDecision: { not: "pending" } },
      orderBy: { resolvedAt: "desc" },
      take: windowSize,
      select: { tier: true, proposedTools: true, agreement: true, wouldAutoExecute: true, humanDecision: true },
    }),
    db.autonomyShadowDecision.count({
      where: { organizationId: params.orgId, humanDecision: "pending" },
    }),
  ]);

  const tierStats = new Map<string, { resolved: number; agreements: number; dangerous: number }>();
  const toolStats = new Map<string, { resolved: number; agreements: number; dangerous: number }>();
  let agreements = 0;
  let dangerousRejections = 0;

  const bump = (map: typeof tierStats, key: string, agreed: boolean, dangerous: boolean) => {
    const slice = map.get(key) ?? { resolved: 0, agreements: 0, dangerous: 0 };
    slice.resolved += 1;
    if (agreed) slice.agreements += 1;
    if (dangerous) slice.dangerous += 1;
    map.set(key, slice);
  };

  for (const row of rows) {
    const agreed = row.agreement === true;
    const dangerous = row.wouldAutoExecute && row.humanDecision === "rejected";
    if (agreed) agreements += 1;
    if (dangerous) dangerousRejections += 1;
    bump(tierStats, row.tier, agreed, dangerous);
    for (const tool of row.proposedTools.length ? row.proposedTools : ["(none)"]) {
      bump(toolStats, tool, agreed, dangerous);
    }
  }

  const sliceFrom = (s: { resolved: number; agreements: number; dangerous: number }): ReadinessSlice => ({
    resolved: s.resolved,
    agreements: s.agreements,
    agreementRate: rate(s.agreements, s.resolved),
    dangerousRejections: s.dangerous,
  });

  return {
    windowSize,
    resolved: rows.length,
    pending,
    agreements,
    agreementRate: rate(agreements, rows.length),
    dangerousRejections,
    byTier: [...tierStats.entries()].map(([tier, s]) => ({ tier, ...sliceFrom(s) })),
    byTool: [...toolStats.entries()]
      .map(([tool, s]) => ({ tool, ...sliceFrom(s) }))
      .sort((a, b) => b.resolved - a.resolved),
  };
}
