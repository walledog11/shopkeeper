import { db } from '@shopkeeper/db';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { READ_TOOLS } from '../constants.js';
import { relativeAge } from '../routes/telegram/format.js';
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
    .filter((toolCall) => !READ_TOOLS.has(toolCall.name))
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
  const { pendingPlan, pendingQuestion, pendingDigest } = context;

  if (pendingPlan) {
    const thread = await db.thread.findFirst({
      where: { id: pendingPlan.threadId, organizationId },
      select: { customer: { select: { name: true } } },
    });
    const customerName = thread?.customer?.name ?? 'the customer';
    const steps = planStepLines(pendingPlan.rawToolCalls);
    const draft = firstDraftExcerpt(pendingPlan.rawToolCalls);
    return [
      "A drafted plan is awaiting the merchant's decision:",
      `- Ticket: ${pendingPlan.threadId} (customer: ${customerName})`,
      `- What it's about: ${pendingPlan.instruction}`,
      ...(steps.length > 0 ? ['- Actions it will take:', ...steps] : []),
      ...(draft ? ['- Draft message the merchant is approving:', `  "${draft}"`] : []),
    ].join('\n');
  }

  if (pendingQuestion) {
    return [
      "A question is awaiting the merchant's answer:",
      `- ${pendingQuestion.question}`,
    ].join('\n');
  }

  if (pendingDigest) {
    const age = relativeAge(Date.now() - new Date(pendingDigest.sentAt).getTime());
    const count = pendingDigest.threadIds.length;
    return `A support digest was sent${age ? ` ${age}` : ''} covering ${count} ticket${count === 1 ? '' : 's'}, awaiting the merchant's triage.`;
  }

  return NOTHING_PENDING;
}
