import type { AgentPlan } from '../../types.js';
import { firstDraftExcerpt, type OperatorSurface } from '../operator-ledger.js';
import {
  formatRequestDisplayLine,
  type RequestDisplay,
} from '../request-display.js';
import { endSentence } from './headers.js';

// The tool-result a revise/answer control tool returns to the model after re-drafting
// a plan. Unlike formatOperatorPlanMessage (the operator-facing card fanned out to
// the merchant's other channels), this is read by the model, which relays it in its
// own words — so it carries the concrete draft, not the yes/no card footer.
export function formatOperatorDraftSummary(
  customerName: string | null,
  plan: AgentPlan,
  surface: OperatorSurface = 'messaging',
  requestDisplay?: RequestDisplay,
): string {
  const name = customerName ? customerName.split(' ')[0] : 'the customer';
  const actionableSteps = plan.steps.filter((step) => step.category !== 'read');
  const stepList = actionableSteps
    .map((step) => step.label || step.description)
    .join('; ');
  const draftBody = firstDraftExcerpt(plan.rawToolCalls);

  const parts = [
    `Re-drafted the plan for ${name} (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}: ${stepList}).`,
  ];
  if (requestDisplay) {
    parts.push(`Request: ${endSentence(formatRequestDisplayLine(requestDisplay, name))}`);
  }
  if (draftBody) parts.push(`Draft: "${draftBody}"`);
  parts.push(surface === 'desk'
    ? "It's parked for the merchant's approval — they can approve it on the plan itself or ask for more changes."
    : "It's parked for the merchant's approval — they can reply yes to send it or ask for more changes.");
  return parts.join(' ');
}
