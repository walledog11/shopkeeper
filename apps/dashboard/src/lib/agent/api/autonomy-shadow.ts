import { createHash, randomUUID } from "node:crypto";
import { db } from "@shopkeeper/db";
import { TOOL_CATEGORIES } from "@shopkeeper/agent/tools";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import logger from "@/lib/server/logger";
import type { AgentPlan, OrgSettings, RawToolCall } from "@/types";

// Hash of the mutation set a plan would auto-execute, so a recorded shadow
// proposal can be compared against what the human ultimately executed. Order
// the agent emitted tools in is preserved; non-mutation tools (replies, reads)
// are excluded so a reworded reply does not read as a disagreement.
export function hashMutationCalls(toolCalls: RawToolCall[]): string {
  const mutations = toolCalls.reduce<Array<{ name: string; input: RawToolCall["input"] }>>((items, tc) => {
    if (TOOL_CATEGORIES[tc.name] === "action") {
      items.push({ name: tc.name, input: tc.input });
    }
    return items;
  }, []);
  return createHash("sha256").update(JSON.stringify(mutations)).digest("hex");
}

function mutationCount(toolCalls: RawToolCall[]): number {
  return toolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action").length;
}

function mutationToolNames(toolCalls: RawToolCall[]): string[] {
  const names = new Set<string>();
  for (const tc of toolCalls) {
    if (TOOL_CATEGORIES[tc.name] === "action") names.add(tc.name);
  }
  return Array.from(names);
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
