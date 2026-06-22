import type { AgentPlan as PackageAgentPlan } from '@shopkeeper/agent/types';
import type { AgentPlan as GatewayAgentPlan } from '../types.js';

// Gateway notifications only need the JSON view used by Telegram/operator
// approval: visible steps plus raw tool calls. Keep this adapter explicit so a
// package AgentPlan shape change does not cross the boundary via a broad cast.
export function toGatewayAgentPlan(plan: PackageAgentPlan | null): GatewayAgentPlan | null {
  if (!plan) return null;

  return {
    steps: plan.steps.map((step) => ({
      label: step.label,
      description: step.description,
      category: step.category,
      tool: step.tool,
      enabled: step.enabled,
    })),
    rawToolCalls: plan.rawToolCalls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
    })),
  };
}
