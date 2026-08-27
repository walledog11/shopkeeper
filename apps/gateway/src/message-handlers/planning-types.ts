import type { DbThreadRequestDisposition } from '@shopkeeper/db';
import type { AgentPlan } from '../types.js';

// Whether this request is allowed to park a plan card or a question in front of
// the merchant. A greeting and a "thanks, got it" are not work: they get the
// agent's ordinary safe reply and then stop, rather than manufacturing an
// approval whose only content is that someone said hello.
//
// `informational` deliberately stays eligible even though it is routine. The
// safe-reply lane already sends routine answers without asking anyone, so a plan
// that reaches the parking decision at all is one that lane declined — blocked
// by policy, carrying a warning, or needing a merchant fact. Suppressing those
// would answer nobody and tell nobody. Null is eligible for the same reason the
// classifier's fallback is `unclear` and not `none`: an absent verdict must
// leave a real request visible.
//
// This lives here, beside the pipeline's other shared vocabulary, because it has
// no runtime dependencies. Putting it next to the classifier that writes the
// field would give every consumer an import edge to the Anthropic client, and
// route around the `intelligence.js` mock that keeps that graph out of the
// worker tests.
export function mayParkMerchantWork(
  disposition: DbThreadRequestDisposition | null | undefined,
): boolean {
  return disposition !== 'none' && disposition !== 'acknowledgement';
}

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
  // Set when the plan's terminal tool is `ask_operator` (decideAutonomy →
  // needs_merchant_input): the clarifying question to push to the operator.
  merchantQuestion?: string | null;
  autoExecuted?: boolean;
  autoExecutionKind?: 'safe_reply' | 'action';
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
  /** Parent step failed definitely and a child replan finished the remaining work. */
  failureReplanRecovered?: boolean;
  /** Parent step failed definitely and the child replan needs merchant approval. */
  failureReplanAwaitingApproval?: boolean;
  failureReplanFailureTool?: string;
  failureReplanFailureReason?: string;
}

/** Whether auto-execution should fan out one operator notification. */
export function shouldNotifyAutoExecution(
  result: Pick<
    PrecomputedPlanResult,
    'autoExecutionKind' | 'autoExecutionStatus' | 'failureReplanRecovered'
  >,
): boolean {
  if (result.failureReplanRecovered) return true;
  return result.autoExecutionKind !== 'safe_reply' || result.autoExecutionStatus !== 'success';
}
