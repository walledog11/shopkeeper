import type { DbChannelType } from '@shopkeeper/db';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import {
  classifyPerson,
  customerFirstName,
  personObject,
  personSubject,
  type PersonName,
} from '@shopkeeper/agent/person-name';
import type { RequestReason } from '@shopkeeper/agent/classifier-signals';
import { lowerFirst } from '../../../lib/sentence-case.js';
import { formatBlockedTicketLine } from '../../../maintenance/digest-briefing/ticket-lines.js';
import type { ConfirmedOrder } from '../../../storefront-chat-verified-orders.js';
import type { AgentPlan, PlanStep, ProposalCommunication } from '@shopkeeper/agent/types';
import { displayApprovedDraft } from '@shopkeeper/agent/reply-placeholders';
import { lineItemWriteSentence } from '@shopkeeper/agent/line-item-display';
import {
  merchantFollowUpBeforeApproval,
  outstandingMerchantFollowUps,
} from '@shopkeeper/agent/merchant-follow-up';
import { firstDraftExcerpt } from '../../operator/operator-ledger.js';
import { formatDeadlineLead, formatRequestPhrase } from '../../../maintenance/briefing-fields.js';
import { requestDisplayHasContext, type RequestDisplay } from '../../shared/request-display.js';
import { FRESH_STAGE } from './conversation-stage.js';
import { channelRepliedPhrase, endSentence, formatRequestHeaderLines } from './headers.js';
import type { ConversationStage, QueueNotice } from './types.js';

function isSendStep(step: PlanStep): boolean {
  return step.tool === 'send_reply' || step.tool === 'send_email';
}

// Past this an exact draft is not shown in a text message, and a message that
// cannot be shown is not one to approve from here.
const EXACT_DRAFT_DISPLAY_LIMIT = 3000;

export function requiresDashboardDraftReview(communication?: ProposalCommunication): boolean {
  return communication?.mode === 'exact_draft'
    && displayApprovedDraft(communication.draft).length > EXACT_DRAFT_DISPLAY_LIMIT;
}

type ExactDraft = Extract<ProposalCommunication, { mode: 'exact_draft' }>;

function emailSubject(rawToolCalls: readonly { name: string; input?: unknown }[]): string | null {
  const call = rawToolCalls.find((toolCall) => toolCall.name === 'send_email');
  const subject = call?.input && typeof call.input === 'object'
    ? (call.input as { subject?: unknown }).subject
    : null;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : null;
}

// Where the approved message goes, finishing "I'd …": the merchant approves the
// destination along with the words.
function replyPhrase(
  step: PlanStep,
  draft: ExactDraft | null,
  person: PersonName,
  channelType: DbChannelType,
  rawToolCalls: readonly { name: string; input?: unknown }[],
): string {
  if (draft?.destination.kind === 'email') {
    const subject = emailSubject(rawToolCalls);
    return `email ${draft.destination.id}${subject ? `, subject "${subject}"` : ''}`;
  }
  if (draft) return `reply ${channelRepliedPhrase(draft.destination.channel as DbChannelType)}`;
  return step.tool === 'send_email' ? `email ${personObject(person)}` : `reply ${channelRepliedPhrase(channelType)}`;
}

// Why the customer wants it, as the merchant would say it. A reason the
// classifier did not name says nothing.
const REASON_SENTENCES: Partial<Record<RequestReason, string>> = {
  damaged: 'It arrived damaged.',
  defective: "They say it doesn't work.",
  wrong_item: 'They got the wrong item.',
  not_received: "It hasn't arrived.",
  late: "It's running late.",
  changed_mind: 'They changed their mind.',
};

// The opening a colleague would write: who it is, what they confirmed, what they
// want and why, from the request's fields. A request with no ask the card can
// name keeps the request line it always had.
function openingLines(input: {
  person: PersonName;
  display: RequestDisplay;
  confirmations: readonly string[];
  confirmedOrderNames: readonly string[];
  fallback: string;
  now: Date;
}): string[] {
  const subject = personSubject(input.person);
  const confirmed = input.confirmations.length > 0 ? `confirmed ${input.confirmations.join(' and ')}` : null;
  const facts = input.display.kind === 'classified' && input.display.facts.ask !== 'none' && input.display.facts.ask !== 'other'
    ? input.display.facts
    : null;
  if (!facts) {
    return confirmed ? [input.fallback, `${subject} ${confirmed}.`] : [input.fallback];
  }
  const order = facts.order && !input.confirmedOrderNames.includes(facts.order) ? ` on ${facts.order}` : '';
  const asked = `${formatRequestPhrase(facts)}${order}`;
  const lines = [`${subject} ${[confirmed, asked].filter(Boolean).join(' and ')}.`];
  const reason = facts.reason ? REASON_SENTENCES[facts.reason] : undefined;
  const deadline = formatDeadlineLead(facts, input.now);
  if (reason || deadline) lines[0] = [lines[0], reason, deadline ? endSentence(deadline) : null].filter(Boolean).join(' ');
  return lines;
}

// One action as the rest of "I'd …": the items it changes when the planner bound
// them from Shopify, else its label.
function actionPhrase(step: PlanStep, person: PersonName, rawToolCalls: readonly CardToolCall[] | undefined): string {
  const items = lineItemSentence(step, rawToolCalls);
  if (items) return lowerFirst(items);
  return parkedActionLabel([step], person) ?? lowerFirst(step.label || step.description);
}

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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

type CardToolCall = { id?: string; name: string; input?: unknown };

// The step as a sentence naming the items it changes, when the planner bound
// them from Shopify. The IDs alone would let a wrong line read like the right one.
function lineItemSentence(step: PlanStep, rawToolCalls: readonly CardToolCall[] | undefined): string | null {
  const call = rawToolCalls?.find((toolCall) => toolCall.id === step.id);
  return call ? lineItemWriteSentence(call.name, call.input) : null;
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
    rawToolCalls?: readonly CardToolCall[];
    stage?: ConversationStage;
    /** Injectable clock for deterministic deadline rendering in tests. */
    now?: Date;
    // Honesty disclosure about what parking this card does to the operator's
    // queue: `replaces` (cap-1: it evicts a different thread's pending plan),
    // `evicts` (cap>1: the queue is full so the oldest waiting plan is trimmed),
    // or `stacked` (cap>1: it joins the queue, nothing dropped, so a bare yes/no
    // no longer says which card it answers).
    queueNotice?: QueueNotice;
    // Orders this sender showed are theirs. Without it the card describes an
    // anonymous visitor above a draft that quotes their address, and the
    // merchant has no way to tell a correct disclosure from a leak.
    verifiedOrders?: readonly ConfirmedOrder[];
    validation?: AgentPlan['validation'];
    // The customer's own words, for the threads whose structured request did not
    // survive. Only read when `requestDisplay` cannot ground the card itself.
    sourceMessageText?: string | null;
    // The exact customer message this proposal binds. Shown whole, with where it
    // goes, because it is what the approval sends.
    communication?: ProposalCommunication;
    // The customer's photos of a damage claim: sent above this card, or not
    // shown at all.
    damagePhotos?: { count: number; shown: boolean };
  },
): string {
  const stage = options?.stage ?? FRESH_STAGE;
  const now = options?.now ?? new Date();
  const confirmedOrders = options?.verifiedOrders ?? [];
  const verifiedOrders = confirmedOrders.map(order => order.orderName);
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
  // An exact draft is shown whole; a legacy draft keeps its excerpt. A receipt
  // placeholder shows the value its call already binds (a refund's Shopify
  // quote), or else what it will hold.
  const exactDraft = options?.communication?.mode === 'exact_draft' ? options.communication : null;
  const exactDraftText = exactDraft
    ? displayApprovedDraft(exactDraft.draft, {
        bindings: exactDraft.allowedResultBindings,
        rawToolCalls: options?.rawToolCalls ?? [],
      })
    : null;
  const exactDraftHidden = requiresDashboardDraftReview(options?.communication);
  const draftBody = exactDraftText !== null
    ? (exactDraftHidden ? null : exactDraftText)
    : options?.rawToolCalls ? firstDraftExcerpt(options.rawToolCalls) : null;

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

  const confirmedBy = (method: ConfirmedOrder['method']) => confirmedOrders
    .filter(order => order.method === method)
    .map(order => order.orderName);
  const lines: string[] = openingLines({
    person,
    display: requestDisplay,
    confirmations: [
      ...(confirmedBy('email').length > 0 ? [`the email on ${confirmedBy('email').join(', ')}`] : []),
      ...(confirmedBy('zip').length > 0 ? [`the shipping zip on ${confirmedBy('zip').join(', ')}`] : []),
    ],
    confirmedOrderNames: verifiedOrders,
    fallback: formatRequestHeaderLines(person, channelType, requestDisplay, stage, now, sourceQuote)[1]!,
    now,
  });
  const threadLink = options?.threadId && options.dashboardUrl
    ? `${options.dashboardUrl}/dashboard/tickets?thread=${options.threadId}`
    : null;

  if (options?.validation?.status === 'invalid') {
    lines.push(
      '',
      "I couldn't produce a safe executable draft:",
      ...options.validation.issues.map((issue) => `- ${issue.message}`),
    );
    if (threadLink) {
      lines.push('', `Open the thread to regenerate or take over: ${threadLink}`);
    }
    lines.push('', "Nothing can run from this draft. Tell me what to change, or dismiss it.");
    return lines.join('\n');
  }

  // The evidence the plan was made on, beside the request it supports.
  const photos = options?.damagePhotos;
  const photosHidden = photos !== undefined && !photos.shown;
  if (photos) {
    const many = photos.count > 1;
    lines.push(photos.shown
      ? `Their ${many ? `${photos.count} photos` : 'photo'} of the damage ${many ? 'are' : 'is'} above.`
      : `They sent ${many ? `${photos.count} photos` : 'a photo'} of the damage that I can't show here.`);
  }

  // Escalation is never something the merchant approves — it is the statement
  // that the thread is theirs now. Alone it is the whole card. Alongside a reply
  // it is context for that reply, not an action they are asked to authorise.
  // (A guest storefront escalation always arrives paired with a reply, because a
  // shopper sitting in an open chat window cannot be left in silence.)
  const escalationStep = actionableSteps.find((step) => step.tool === 'escalate_to_human');
  const approvableSteps = actionableSteps.filter((step) => step.tool !== 'escalate_to_human');
  const escalateOnly = escalationStep !== undefined && approvableSteps.length === 0;
  const sendStep = approvableSteps.find(isSendStep);
  const actionSteps = approvableSteps.filter((step) => !isSendStep(step));

  if (escalateOnly) {
    const reason = options?.rawToolCalls ? escalationReason(options.rawToolCalls) : null;
    lines.push('', reason
      ? `This one needs you: ${endSentence(reason)}`
      : "This one needs you — I can't answer it myself.");
  } else if (approvableSteps.length > 0) {
    // What a colleague would say: the actions and the reply in one sentence, the
    // reply quoted under it. A list only once there are too many actions for one.
    const reply = sendStep
      ? replyPhrase(sendStep, exactDraft, person, channelType, options?.rawToolCalls ?? [])
      : null;
    const actions = actionSteps.map((step) => actionPhrase(step, person, options?.rawToolCalls));
    const opensDraft = reply && draftBody ? ':' : '.';
    if (actions.length <= 2) {
      const doing = actions.join(' and ');
      const sentence = doing && reply ? `${doing}, then ${reply}` : doing || reply!;
      lines.push('', `I'd ${sentence}${opensDraft}`);
    } else {
      lines.push('', `I'd do ${countWord(actions.length)} things:`, ...actions.map((action, index) => `${index + 1}. ${capitalizeFirst(action)}`));
      if (reply) lines.push(`Then I'd ${reply}${opensDraft}`);
    }
    if (reply && draftBody) lines.push(`"${draftBody}"`);
  }

  // What approving still leaves to them, said before they approve it.
  const followUps = outstandingMerchantFollowUps(approvableSteps.flatMap((step) => (step.tool ? [step.tool] : [])));
  if (followUps.length > 0) {
    lines.push('', ...followUps.map((followUp) => merchantFollowUpBeforeApproval(followUp, personObject(person))));
  }

  // The reply goes out and the thread still lands on them. Without this the
  // merchant approves the reply and reasonably reads that as the whole answer.
  if (escalationStep && !escalateOnly) {
    const reason = options?.rawToolCalls ? escalationReason(options.rawToolCalls) : null;
    lines.push('', reason
      ? `Then it's yours: ${endSentence(reason)}`
      : "Then it's yours — I can't take it further myself.");
  }

  if (options?.queueNotice) {
    const notice = options.queueNotice;
    if (notice.kind === 'stacked') {
      const name = customerFirstName(customerName);
      lines.push('', name
        ? `(You have ${notice.waiting} plans waiting, so say whose you mean, like "yes ${name}".)`
        : `(You have ${notice.waiting} plans waiting, so say which one you mean when you answer.)`);
    } else {
      const earlierName = customerFirstName(notice.customerName);
      const earlier = earlierName ? `${earlierName}'s plan` : 'The earlier plan';
      lines.push('', notice.kind === 'replaces'
        ? `(${earlier} is off your phone now, so yes or no here only answers this one. It's still on your dashboard.)`
        : `(${earlier} is off your phone now to keep your list short. It's still on your dashboard.)`);
    }
  }

  let closing: string;
  if (escalateOnly) {
    // No question, because there is nothing to answer: approving an escalation
    // approves handing the merchant a thread they are already holding. Tell them
    // where it sits instead of asking them to authorise it.
    closing = "Nothing's gone out — it's waiting on you.";
  } else if (exactDraftHidden) {
    // The same rule as an unshowable request: the approval would send words the
    // merchant has not seen.
    closing = 'The message is too long to show here — open the thread to read it before approving.';
  } else if (photosHidden) {
    // The approval would judge a claim on evidence the merchant has not seen.
    closing = 'Open the thread to see the photos before approving.';
  } else if (!canShowRequest) {
    // Never ask someone to approve what cannot be shown. The card still names
    // the action, because the plan is real even when the request rendering is
    // not — what it drops is the question, which is the half that asked for a
    // blind decision. Same call the briefing makes with needsThreadReview.
    closing = "I can't show you what they asked — open the thread first.";
  } else {
    const replyOnly = approvableSteps.length > 0 && approvableSteps.every(isSendStep);
    closing = replyOnly ? 'OK to send?' : 'OK to go ahead?';
  }
  lines.push('', threadLink ? `${closing} (thread: ${threadLink})` : closing);

  return lines.join('\n');
}
