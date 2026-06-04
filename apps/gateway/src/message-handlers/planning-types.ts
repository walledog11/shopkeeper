import type { AgentPlan } from '../types.js';

export interface AgentActionResult {
  tool: string;
  result: string;
}

export interface PrecomputedPlanResult {
  plan: AgentPlan;
  instruction: string;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}
