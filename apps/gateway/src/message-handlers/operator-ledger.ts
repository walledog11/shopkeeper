import { db } from '@shopkeeper/db';
import { isReadToolName, PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { buildDigestLedgerSection } from './digest-triage.js';
import type { OperatorContext, ToolCall } from '../operator-context.js';
import {
  formatRequestDisplayLine,
  redactPostalAddresses,
  unavailableRequestDisplay,
} from './request-display.js';

const NOTHING_PENDING = "Nothing is awaiting the merchant's decision.";
const DRAFT_EXCERPT_LIMIT = 600;

/** Where the merchant is reading this turn. Same ledger, different affordance. */
export type OperatorSurface = 'desk' | 'messaging';

// A pending plan is resolved by a button on the dashboard and by a reply on a
// phone. Telling a merchant who is looking at an Approve button to "reply yes" is
// wrong copy, so the ledger names the affordance they actually have.
const PLAN_AFFORDANCE: Record<OperatorSurface, string> = {
  desk: "How the merchant acts on this: they are on the dashboard, where every plan above carries its own Approve and Dismiss button. Do not tell them to reply yes or text back — say you're waiting on their go-ahead.",
  messaging: 'How the merchant acts on this: they are texting, so they answer here — yes to approve, no to dismiss, or a change to re-draft.',
};

// The customer-facing body a send tool would deliver. Used both to surface the
// draft the merchant is approving (ledger) and to summarize a re-drafted plan.
export function extractSendDraftBody(toolCall: { name: string; input?: unknown }): string | null {
  const input = toolCall.input;
  if (!input || typeof input !== 'object') return null;
  if (toolCall.name === 'send_reply') {
    const text = (input as { text?: unknown }).text;
    return typeof text === 'string' ? text : null;
  }
  if (toolCall.name === 'send_email') {
    const body = (input as { body?: unknown }).body;
    return typeof body === 'string' ? body : null;
  }
  return null;
}

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

function planStepLines(rawToolCalls: ToolCall[]): string[] {
  return rawToolCalls
    .filter((toolCall) => !isReadToolName(toolCall.name))
    .map((toolCall) => `  - ${PLAN_STEP_LABELS[toolCall.name] ?? toolCall.name}`);
}

// The first send tool's body in a plan, truncated for display. Shared by the
// ledger and the plan/draft notification copy so the excerpt is identical.
export function firstDraftExcerpt(rawToolCalls: readonly { name: string; input?: unknown }[]): string | null {
  for (const toolCall of rawToolCalls) {
    const body = extractSendDraftBody(toolCall);
    if (body) return truncate(redactPostalAddresses(body, rawToolCalls), DRAFT_EXCERPT_LIMIT);
  }
  return null;
}

// Renders the opaque pending-state ledger the operator prompt shows the model:
// what, if anything, is awaiting the merchant's decision. The core treats the
// result as a string; only the gateway knows how OperatorContext maps to it.
export async function renderOperatorLedger(
  organizationId: string,
  context: OperatorContext,
  surface: OperatorSurface = 'messaging',
): Promise<string> {
  const { pendingPlans, pendingQuestion, pendingDigest } = context;

  if (pendingPlans.length > 0) {
    const threads = await db.thread.findMany({
      where: { id: { in: pendingPlans.map((plan) => plan.threadId) }, organizationId },
      select: { id: true, customer: { select: { name: true } } },
    });
    const nameByThread = new Map(threads.map((thread) => [thread.id, thread.customer?.name ?? 'the customer']));

    // One plan: keep the original single-plan wording. Several: a numbered list in
    // the same order the control-tool `plan_ref` selector uses, so "the second one"
    // / "Sarah's" resolves identically on both sides.
    if (pendingPlans.length === 1) {
      const plan = pendingPlans[0]!;
      const steps = planStepLines(plan.rawToolCalls);
      const draft = firstDraftExcerpt(plan.rawToolCalls);
      const display = plan.requestDisplay ?? unavailableRequestDisplay();
      const person = nameByThread.get(plan.threadId) ?? 'the customer';
      return [
        "A drafted plan is awaiting the merchant's decision:",
        `- Ticket: ${plan.threadId} (customer: ${person})`,
        `- What it's about: ${formatRequestDisplayLine(display, person)}`,
        ...(steps.length > 0 ? ['- Actions it will take:', ...steps] : []),
        ...(draft ? ['- Draft message the merchant is approving:', `  "${draft}"`] : []),
        '',
        PLAN_AFFORDANCE[surface],
      ].join('\n');
    }

    const lines: string[] = [
      `${pendingPlans.length} drafted plans are awaiting the merchant's decision. When they approve, decline, or revise, use plan_ref (the number below or the customer name) to say which one:`,
    ];
    pendingPlans.forEach((plan, index) => {
      const steps = planStepLines(plan.rawToolCalls);
      const draft = firstDraftExcerpt(plan.rawToolCalls);
      const display = plan.requestDisplay ?? unavailableRequestDisplay();
      const person = nameByThread.get(plan.threadId) ?? 'the customer';
      lines.push(
        '',
        `${index + 1}. Ticket ${plan.threadId} (customer: ${person})`,
        `   What it's about: ${formatRequestDisplayLine(display, person)}`,
        ...(steps.length > 0 ? ['   Actions it will take:', ...steps.map((step) => `  ${step}`)] : []),
        ...(draft ? ['   Draft message the merchant is approving:', `     "${draft}"`] : []),
      );
    });
    lines.push('', PLAN_AFFORDANCE[surface]);
    return lines.join('\n');
  }

  if (pendingQuestion) {
    return [
      "A question is awaiting the merchant's answer:",
      `- ${pendingQuestion.question}`,
    ].join('\n');
  }

  if (pendingDigest) {
    return buildDigestLedgerSection(organizationId, pendingDigest);
  }

  return NOTHING_PENDING;
}
