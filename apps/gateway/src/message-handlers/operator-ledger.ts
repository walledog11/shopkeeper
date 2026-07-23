import { db } from '@shopkeeper/db';
import { isReadToolName, PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { buildDigestLedgerSection } from './digest-triage.js';
import type { OperatorContext, ToolCall } from '../operator-context.js';

const NOTHING_PENDING = "Nothing is awaiting the merchant's decision.";
const DRAFT_EXCERPT_LIMIT = 600;

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
    if (body) return truncate(body, DRAFT_EXCERPT_LIMIT);
  }
  return null;
}

// Renders the opaque pending-state ledger the operator prompt shows the model:
// what, if anything, is awaiting the merchant's decision. The core treats the
// result as a string; only the gateway knows how OperatorContext maps to it.
export async function renderOperatorLedger(
  organizationId: string,
  context: OperatorContext,
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
      return [
        "A drafted plan is awaiting the merchant's decision:",
        `- Ticket: ${plan.threadId} (customer: ${nameByThread.get(plan.threadId) ?? 'the customer'})`,
        `- What it's about: ${plan.instruction}`,
        ...(steps.length > 0 ? ['- Actions it will take:', ...steps] : []),
        ...(draft ? ['- Draft message the merchant is approving:', `  "${draft}"`] : []),
      ].join('\n');
    }

    const lines: string[] = [
      `${pendingPlans.length} drafted plans are awaiting the merchant's decision. When they approve, decline, or revise, use plan_ref (the number below or the customer name) to say which one:`,
    ];
    pendingPlans.forEach((plan, index) => {
      const steps = planStepLines(plan.rawToolCalls);
      const draft = firstDraftExcerpt(plan.rawToolCalls);
      lines.push(
        '',
        `${index + 1}. Ticket ${plan.threadId} (customer: ${nameByThread.get(plan.threadId) ?? 'the customer'})`,
        `   What it's about: ${plan.instruction}`,
        ...(steps.length > 0 ? ['   Actions it will take:', ...steps.map((step) => `  ${step}`)] : []),
        ...(draft ? ['   Draft message the merchant is approving:', `     "${draft}"`] : []),
      );
    });
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
