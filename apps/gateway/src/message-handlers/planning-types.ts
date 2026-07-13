import type { AgentPlan } from '../types.js';

export interface AgentActionResult {
  tool: string;
  result: string;
}

export interface PlanIdentity {
  planId: string;
  sourceMessageId: string;
  planHash: string;
  instructionHash: string;
}

export interface PrecomputedPlanResult {
  plan: AgentPlan;
  instruction: string;
  identity?: PlanIdentity;
  // Set when the plan's terminal tool is `ask_operator` (classifyHomePlan →
  // needs_merchant_input): the clarifying question to push to the operator.
  merchantQuestion?: string | null;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}
