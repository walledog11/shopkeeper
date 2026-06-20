import type { AgentPlan } from '../types.js';

export interface AgentActionResult {
  tool: string;
  result: string;
}

export interface PrecomputedPlanResult {
  plan: AgentPlan;
  instruction: string;
  // Set when the plan's terminal tool is `ask_operator` (classifyHomePlan →
  // needs_merchant_input): the clarifying question to push to the operator.
  merchantQuestion?: string | null;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}
