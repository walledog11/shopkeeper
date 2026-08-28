import type { DbChannelType } from '@shopkeeper/db';
import { customerFirstName } from '@shopkeeper/agent/person-name';
import type { AgentPlan } from '../../types.js';
import type { PrecomputedPlanResult } from '../planning-types.js';
import { channelNoun, endSentence } from './headers.js';

export function formatAutoExecutionMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  plan: AgentPlan,
  result: PrecomputedPlanResult,
): string {
  const firstName = customerFirstName(customerName);
  const noun = channelNoun(channelType);
  // Neutral possessive header: by the time this fans out, the agent's own reply
  // is already in the thread, so fresh-vs-follow-up detection would misread it.
  const headline = firstName
    ? `${firstName}'s ${noun}.`
    : `${noun.charAt(0).toUpperCase()}${noun.slice(1)}.`;
  const actionableSteps = plan.steps.filter((step) => step.category !== 'read');
  const stepLines = actionableSteps.map((step, index) => (
    `${index + 1}. ${step.description || step.label}`
  ));
  const statusLine = result.failureReplanRecovered
    ? 'One step failed, then I finished the rest myself:'
    : result.failureReplanAwaitingApproval
      ? 'One step failed. I drafted a follow-up but it needs your approval:'
      : result.autoExecutionStatus === 'error'
        ? 'I tried to handle this one myself but hit a problem:'
        : 'Handled this one myself:';
  const failureStep = result.failureReplanRecovered || result.failureReplanAwaitingApproval
    ? result.failureReplanFailureTool ?? null
    : null;

  const lines: (string | null)[] = [
    headline,
    endSentence(summary),
    '',
    statusLine,
    ...stepLines,
    failureStep ? '' : null,
    failureStep
      ? `Problem step: ${failureStep}${result.failureReplanFailureReason ? ` — ${result.failureReplanFailureReason}` : ''}`
      : null,
    result.autoExecutionSummary ? '' : null,
    result.autoExecutionSummary ?? null,
    result.autoExecutionError ? '' : null,
    result.autoExecutionError ? `Error: ${result.autoExecutionError}` : null,
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}
