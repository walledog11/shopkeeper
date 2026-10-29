import { DRAFT_PLAN_TOOL } from "@shopkeeper/agent/composer-plan-handoff";
import { defineTool, toolOk, type AgentToolDefinition } from "@shopkeeper/agent/tools";

// Read-category because it reads and writes nothing: the composer sees the call
// and starts planning, where the change is drafted for the merchant's approval.
export function buildComposerPlanHandoffTools(): Record<string, AgentToolDefinition> {
  const draftPlan = defineTool({
    name: DRAFT_PLAN_TOOL,
    description:
      "Hand the operator's instruction to planning, which drafts the change for their approval. Call it when they ask you to do something rather than asking a question.",
    fields: {},
    category: "read",
    group: "thread",
    capabilities: [],
    label: "Started a plan",
    planStepLabel: "Start a plan",
    execute: async () => toolOk("Planning has started. Reply with one short sentence; do not draft the change yourself."),
  });
  return { [draftPlan.name]: draftPlan };
}
