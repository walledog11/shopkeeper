import type { DbChannelType } from '@shopkeeper/db';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import {
  classifyPerson,
  customerFirstName,
  personObject,
  type PersonName,
} from '@shopkeeper/agent/person-name';
import { lowerFirst } from '../../lib/sentence-case.js';
import { formatBlockedTicketLine } from '../../maintenance/digest-briefing/ticket-lines.js';
import type { AgentPlan, PlanStep } from '../../types.js';
import { firstDraftExcerpt } from '../operator-ledger.js';
import { requestDisplayHasContext, type RequestDisplay } from '../request-display.js';
import { FRESH_STAGE } from './conversation-stage.js';
import { endSentence, formatRequestHeaderLines } from './headers.js';
import type { ConversationStage, QueueNotice } from './types.js';

function isSendStep(step: PlanStep): boolean {
  return step.tool === 'send_reply' || step.tool === 'send_email';
}

// Why the plan escalated, so the card can say what the agent concluded instead
// of only that it gave up. The reason is already on the tool call — either
// model-authored or templated from the routing signals — and it is the most
// useful sentence in the whole notification.
function escalationReason(
  rawToolCalls: readonly { name: string; input?: unknown }[],
): string | null {
  for (const toolCall of rawToolCalls) {
    if (toolCall.name !== 'escalate_to_human') continue;
    const input = toolCall.input;
    if (!input || typeof input !== 'object') continue;
    const reason = (input as Record<string, unknown>).reason;
    if (typeof reason === 'string' && reason.trim()) {
      return reason.trim();
    }
  }
  return null;
}

// A phrase that completes "I won't …", parked alongside the plan so a fast-path
// dismissal can name what it dropped without re-reading the thread.
export function parkedActionLabel(steps: PlanStep[], person: PersonName): string | undefined {
  const actionableSteps = steps.filter((step) => step.category !== 'read');
  if (actionableSteps.length === 0) return undefined;

  const firstName = person.kind === 'named' ? person.firstName : null;
  const forCustomer = firstName ? ` for ${firstName}` : '';
  if (actionableSteps.length > 1) {
    return `run those ${actionableSteps.length} steps${forCustomer}`;
  }

  const step = actionableSteps[0]!;
  if (step.tool === 'send_reply') return `reply to ${personObject(person)}`;
  if (step.tool === 'send_email') return `email ${personObject(person)}`;

  const label = (step.tool ? PLAN_STEP_LABELS[step.tool] : undefined) ?? step.label;
  if (!label) return undefined;
  return `${lowerFirst(label)}${forCustomer}`;
}

export function formatOperatorPlanMessage(
  customerName: string | null,
  channelType: DbChannelType,
  requestDisplay: RequestDisplay,
  steps: PlanStep[],
  options?: {
    threadId?: string;
    dashboardUrl?: string;
    rawToolCalls?: readonly { name: string; input?: unknown }[];
    stage?: ConversationStage;
    /** Injectable clock for deterministic deadline rendering in tests. */
    now?: Date;
    // Honesty disclosure about what parking this card does to the operator's
    // queue: `replaces` (cap-1: it evicts a different thread's pending plan),
    // `evicts` (cap>1: the queue is full so the oldest waiting plan is trimmed),
    // or `stacked` (cap>1: it joins the queue, nothing dropped).
    queueNotice?: QueueNotice;
    // Orders this storefront shopper proved control of. Without it the card
    // describes an anonymous visitor above a draft that quotes their address,
    // and the merchant has no way to tell a correct disclosure from a leak.
    verifiedOrders?: readonly string[];
    validation?: AgentPlan['validation'];
    // The customer's own words, for the threads whose structured request did not
    // survive. Only read when `requestDisplay` cannot ground the card itself.
    sourceMessageText?: string | null;
  },
): string {
  const stage = options?.stage ?? FRESH_STAGE;
  const now = options?.now ?? new Date();
  const verifiedOrders = options?.verifiedOrders ?? [];
  // The card states the verified orders on their own line below, so the name
  // does not repeat them: a verified shopper is "the customer" here, not "the
  // customer on #1024 … They confirmed the email on #1024".
  const person = classifyPerson({
    customerName,
    channelType,
    verifiedOrders,
    followingText: verifiedOrders.join(', '),
  });
  const actionableSteps = steps.filter((step) => step.category !== 'read');

  // The actual draft the merchant is approving, so approval is not sight-unseen.
  const draftBody = options?.rawToolCalls ? firstDraftExcerpt(options.rawToolCalls) : null;

  // A thread still on a classifier version older than requestFacts renders no
  // structured request, but the customer's message is on the thread either way.
  // The briefing has quoted it since Milestone 1; the card printed "Request
  // details unavailable" and then asked "Good to send?" underneath it.
  const sourceMessageText = options?.sourceMessageText?.trim() ? options.sourceMessageText : null;
  const sourceQuote = !requestDisplayHasContext(requestDisplay, now) && sourceMessageText
    ? formatBlockedTicketLine({
        customer: { name: customerName },
        channelType,
        verifiedOrders,
        pendingMessage: sourceMessageText,
      }, now)
    : null;
  const canShowRequest = requestDisplayHasContext(requestDisplay, now) || sourceQuote !== null;

  const lines: string[] = formatRequestHeaderLines(
    person,
    channelType,
    requestDisplay,
    stage,
    now,
    sourceQuote,
  );

  if (options?.validation?.status === 'invalid') {
    lines.push(
      '',
      "I couldn't produce a safe executable draft:",
      ...options.validation.issues.map((issue) => `- ${issue.message}`),
    );
    if (options?.threadId && options.dashboardUrl) {
      lines.push('', `Open the thread to regenerate or take over: ${options.dashboardUrl}/dashboard/tickets?thread=${options.threadId}`);
    }
    lines.push('', "Nothing can run from this draft. Tell me what to change, or dismiss it.");
    return lines.join('\n');
  }

  // Directly under the header, because it qualifies the header: everything above
  // describes an anonymous storefront visitor, and this is the one fact that
  // makes disclosing order details to them correct rather than a leak. It still
  // names the mechanism — an email they had to receive — so the merchant can
  // judge what it is worth, but in the register a colleague would use. The
  // earlier "Verified: entered a code emailed to the address on #1024." asked
  // them to audit an authentication scheme to answer a shipping question.
  if (verifiedOrders.length > 0) {
    lines.push(`They confirmed the email on ${verifiedOrders.join(', ')}.`);
  }

  // Escalation is never something the merchant approves — it is the statement
  // that the thread is theirs now. Alone it is the whole card. Alongside a reply
  // it is context for that reply, not item 2 in a list they are asked to
  // authorise, so it comes out of the numbered steps either way. (A guest
  // storefront escalation always arrives paired with a reply, because a shopper
  // sitting in an open chat window cannot be left in silence.)
  const escalationStep = actionableSteps.find((step) => step.tool === 'escalate_to_human');
  const approvableSteps = actionableSteps.filter((step) => step.tool !== 'escalate_to_human');
  const escalateOnly = escalationStep !== undefined && approvableSteps.length === 0;

  if (escalateOnly) {
    const reason = options?.rawToolCalls ? escalationReason(options.rawToolCalls) : null;
    lines.push('', reason
      ? `This one needs you: ${endSentence(reason)}`
      : "This one needs you — I can't answer it myself.");
  } else if (approvableSteps.length === 1 && isSendStep(approvableSteps[0]!) && draftBody) {
    lines.push('', "I'd reply:", `"${draftBody}"`);
  } else if (approvableSteps.length === 1) {
    // One step is not a list. Numbering a single item is the tell that a machine
    // wrote the card; say it as a sentence instead. parkedActionLabel already
    // renders the phrase that completes "I won't …", which completes "I'd …" too.
    const only = parkedActionLabel(approvableSteps, person);
    const fallback = approvableSteps[0]!.label || approvableSteps[0]!.description;
    lines.push('', only ? `I'd ${only}.` : `I'd ${lowerFirst(fallback)}.`);
    if (draftBody) lines.push('', `The reply: "${draftBody}"`);
  } else if (approvableSteps.length > 0) {
    const stepLines = approvableSteps.map((step, index) => {
      if (step.tool === 'send_reply') return `${index + 1}. Reply to ${personObject(person)}`;
      if (step.tool === 'send_email') return `${index + 1}. Email ${personObject(person)}`;
      return `${index + 1}. ${step.label || step.description}`;
    });
    lines.push('', "Here's what I'd do:", ...stepLines);
    if (draftBody) lines.push('', `The reply: "${draftBody}"`);
  }

  // The reply goes out and the thread still lands on them. Without this the
  // merchant approves the reply and reasonably reads that as the whole answer.
  if (escalationStep && !escalateOnly) {
    const reason = options?.rawToolCalls ? escalationReason(options.rawToolCalls) : null;
    lines.push('', reason
      ? `Then it's yours: ${endSentence(reason)}`
      : "Then it's yours — I can't take it further myself.");
  }

  if (options?.threadId && options.dashboardUrl) {
    lines.push('', `Full thread: ${options.dashboardUrl}/dashboard/tickets?thread=${options.threadId}`);
  }

  if (options?.queueNotice) {
    const notice = options.queueNotice;
    if (notice.kind === 'stacked') {
      lines.push('', `(Added — you now have ${notice.waiting} plans waiting for you.)`);
    } else {
      const earlierName = customerFirstName(notice.customerName);
      if (notice.kind === 'replaces') {
        lines.push('', earlierName
          ? `(This replaces the earlier plan for ${earlierName}. That one's still on your dashboard.)`
          : "(This replaces an earlier plan. It's still on your dashboard.)");
      } else {
        lines.push('', earlierName
          ? `(This pushes out ${earlierName}'s plan to stay under your limit. It's still on your dashboard.)`
          : "(This pushes out the oldest waiting plan to stay under your limit. It's still on your dashboard.)");
      }
    }
  }

  if (escalateOnly) {
    // No question, because there is nothing to answer: approving an escalation
    // approves handing the merchant a thread they are already holding. Tell them
    // where it sits instead of asking them to authorise it.
    lines.push('', "Nothing's gone out — it's waiting on you.");
  } else if (!canShowRequest) {
    // Never ask someone to approve what cannot be shown. The card still names
    // the action, because the plan is real even when the request rendering is
    // not — what it drops is the question, which is the half that asked for a
    // blind decision. Same call the briefing makes with needsThreadReview.
    lines.push('', "I can't show you what they asked — open the thread first.");
  } else {
    const replyOnly = approvableSteps.length > 0 && approvableSteps.every(isSendStep);
    lines.push('', replyOnly ? 'Good to send?' : 'Sound good?');
  }

  return lines.join('\n');
}
