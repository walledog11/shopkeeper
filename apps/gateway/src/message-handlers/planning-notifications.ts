import type { DbChannelType } from '@shopkeeper/db';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { CHANNEL } from '../constants.js';
import logger from '../logger.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import { formatChannelLabel } from '../lib/channel-format.js';
import {
  autoExecutionNotificationIdempotencyKey,
  planNotificationIdempotencyKey,
  questionNotificationIdempotencyKey,
} from '../operator-notify-idempotency.js';
import {
  bindingDeliveryKey,
  listOperatorBindings,
  notifyOperator,
  OperatorNotifyError,
  type OperatorBinding,
  type OperatorNotifyOptions,
} from '../operator-notify.js';
import type { AgentPlan, PlanStep } from '../types.js';
import type { PlanIdentity, PrecomputedPlanResult } from './planning-types.js';
import { firstDraftExcerpt, type OperatorSurface } from './operator-ledger.js';
import { getContext, resolvePendingPlanContexts, removePendingPlanForThread, type PendingPlan } from '../operator-context.js';
import { memberOperatorKey } from '@shopkeeper/agent/internal-thread';
import { getOperatorPlanQueueMax } from '../config/runtime-config.js';
import { listVerifiedOrderNames } from '../storefront-chat-verified-orders.js';
import { getConversationBurst } from './conversation-burst.js';

export interface OperatorNotificationExclude {
  channel: OperatorBinding['channel'];
  deliveryKey: string;
}

// Honesty disclosure about what parking a plan card does to the operator's queue.
export type QueueNotice =
  | { kind: 'replaces'; customerName: string | null }
  | { kind: 'evicts'; customerName: string | null }
  | { kind: 'stacked'; waiting: number };

// Excludes the one device the merchant just answered on, not the person: their
// other bound transport still gets the card, because it is not showing this
// exchange.
function shouldExcludeMember(
  member: OperatorBinding,
  exclude: OperatorNotificationExclude | undefined,
): boolean {
  if (!exclude || member.channel !== exclude.channel) return false;
  return bindingDeliveryKey(member) === exclude.deliveryKey;
}

// Critical fan-out: continue after per-channel failures so a BullMQ retry does not
// re-text channels that already succeeded. Fail only when every channel fails.
async function notifyCriticalToAllOperators(
  organizationId: string,
  bindings: OperatorBinding[],
  notify: (member: OperatorBinding) => Promise<{
    body: string;
    contextPatch: Parameters<typeof notifyOperator>[3];
    idempotencyKey: string;
    appendPlan?: OperatorNotifyOptions['appendPlan'];
  }>,
  threadId: string,
  logLabel: string,
  exclude?: OperatorNotificationExclude,
): Promise<void> {
  let delivered = 0;
  let lastError: unknown;

  for (const member of bindings) {
    if (shouldExcludeMember(member, exclude)) continue;

    const { body, contextPatch, idempotencyKey, appendPlan } = await notify(member);
    try {
      const result = await notifyOperator(organizationId, member, body, contextPatch, {
        policy: 'critical',
        threadId,
        idempotencyKey,
        ...(appendPlan ? { appendPlan } : {}),
      });
      if (result) {
        delivered += 1;
        logger.info(
          { organizationId, threadId, chatId: result.chatId, channel: result.channel },
          `[Worker] ${logLabel} sent`,
        );
      } else {
        logger.warn(
          { organizationId, threadId, chatId: bindingDeliveryKey(member), channel: member.channel },
          `[Worker] ${logLabel} failed`,
        );
      }
    } catch (error) {
      lastError = error;
      logger.error(
        {
          err: (error as Error).message,
          organizationId,
          threadId,
          chatId: bindingDeliveryKey(member),
          channel: member.channel,
        },
        `[Worker] ${logLabel} failed`,
      );
    }
  }

  if (delivered === 0) {
    if (lastError instanceof OperatorNotifyError) {
      throw lastError;
    }
    throw new OperatorNotifyError(`${logLabel} failed on all operator channels`, { cause: lastError });
  }
}

export interface ConversationStage {
  isFollowUp: boolean;
  newMessages: number;
}

const FRESH_STAGE: ConversationStage = { isFollowUp: false, newMessages: 1 };

// Fresh conversation vs. ongoing chain, counted off the same burst the request
// summariser reads. The count floors at 1: when the shop had the last word the
// burst is empty, but the notification still describes one arriving message.
export async function getConversationStage(threadId: string): Promise<ConversationStage> {
  const burst = await getConversationBurst(threadId);
  return {
    isFollowUp: burst.isFollowUp,
    newMessages: Math.max(burst.messages.length, 1),
  };
}

// In-sentence channel wording: "New Instagram DM from Jane", "Jane replied on Instagram".
function channelNoun(channelType: DbChannelType): string {
  if (channelType === CHANNEL.IG_DM) return 'Instagram DM';
  if (channelType === CHANNEL.EMAIL) return 'email';
  if (channelType === CHANNEL.TIKTOK) return 'TikTok message';
  if (channelType === CHANNEL.SHOPIFY_CHAT) return 'storefront chat message';
  return `${formatChannelLabel(channelType)} message`;
}

function channelRepliedPhrase(channelType: DbChannelType): string {
  if (channelType === CHANNEL.IG_DM) return 'on Instagram';
  if (channelType === CHANNEL.EMAIL) return 'by email';
  if (channelType === CHANNEL.TIKTOK) return 'on TikTok';
  if (channelType === CHANNEL.SHOPIFY_CHAT) return 'in your storefront chat';
  return `on ${formatChannelLabel(channelType)}`;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function customerFirstName(customerName: string | null): string | null {
  return customerName ? customerName.split(' ')[0] ?? null : null;
}

// Summaries are model-written and arrive with or without a final stop; without
// one they run into whatever follows.
function endSentence(text: string): string {
  return /[.!?…"']$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

// Two lines, not one joined by an em-dash. The summary is model-written prose
// that routinely carries its own commas, colons and quotes, so splicing it after
// a dash produces a sentence with three kinds of punctuation fighting.
// An anonymous storefront visitor is not "the customer". Nobody has identified
// them, they may have bought nothing, and on this channel they can type any name
// they like — calling them a customer asserts a relationship the merchant does
// not have and that the agent has no way to check.
function anonymousNoun(channelType: DbChannelType): string {
  return channelType === CHANNEL.SHOPIFY_CHAT ? 'Someone on your storefront' : 'The customer';
}

function formatHeaderLines(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  stage: ConversationStage,
): string[] {
  const firstName = customerFirstName(customerName);
  let lead: string;
  if (stage.isFollowUp) {
    const who = firstName ?? anonymousNoun(channelType);
    lead = stage.newMessages > 1
      ? `${who} sent ${stage.newMessages} more messages ${channelRepliedPhrase(channelType)}`
      : `${who} replied ${channelRepliedPhrase(channelType)}`;
  } else {
    const from = firstName ? ` from ${firstName}` : '';
    const burst = stage.newMessages > 1 ? ` (${stage.newMessages} messages)` : '';
    lead = `New ${channelNoun(channelType)}${from}${burst}`;
  }
  // `summary` is the thread's requestSummary — the newest unanswered burst, the
  // same messages `lead` just counted. It was the episode summary once, which
  // described the whole conversation and so restated everything as if it were
  // news; the `Where it stands:` label existed to stop that from reading as a
  // delta. The summariser scopes it to the burst now, so it *is* the delta and
  // the label would understate it.
  return [`${lead}.`, endSentence(summary)];
}

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
    if (typeof reason === 'string' && reason.trim()) return reason.trim();
  }
  return null;
}

// A phrase that completes "I won't …", parked alongside the plan so a fast-path
// dismissal can name what it dropped without re-reading the thread.
export function parkedActionLabel(steps: PlanStep[], customerName: string | null): string | undefined {
  const actionableSteps = steps.filter((step) => step.category !== 'read');
  if (actionableSteps.length === 0) return undefined;

  const firstName = customerFirstName(customerName);
  const forCustomer = firstName ? ` for ${firstName}` : '';
  if (actionableSteps.length > 1) {
    return `run those ${actionableSteps.length} steps${forCustomer}`;
  }

  const step = actionableSteps[0]!;
  if (step.tool === 'send_reply') return `reply to ${firstName ?? 'the customer'}`;
  if (step.tool === 'send_email') return `email ${firstName ?? 'the customer'}`;

  const label = (step.tool ? PLAN_STEP_LABELS[step.tool] : undefined) ?? step.label;
  if (!label) return undefined;
  return `${lowerFirst(label)}${forCustomer}`;
}

export function formatOperatorPlanMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  steps: PlanStep[],
  options?: {
    threadId?: string;
    dashboardUrl?: string;
    rawToolCalls?: readonly { name: string; input?: unknown }[];
    stage?: ConversationStage;
    // Honesty disclosure about what parking this card does to the operator's
    // queue: `replaces` (cap-1: it evicts a different thread's pending plan),
    // `evicts` (cap>1: the queue is full so the oldest waiting plan is trimmed),
    // or `stacked` (cap>1: it joins the queue, nothing dropped).
    queueNotice?: QueueNotice;
    // Orders this storefront shopper proved control of. Without it the card
    // describes an anonymous visitor above a draft that quotes their address,
    // and the merchant has no way to tell a correct disclosure from a leak.
    verifiedOrders?: readonly string[];
  },
): string {
  const stage = options?.stage ?? FRESH_STAGE;
  const firstName = customerFirstName(customerName);
  // A storefront visitor has not identified themselves, so the nameless fallback
  // cannot call them a customer either — the same reason the header says
  // "Someone on your storefront" rather than "the customer".
  const namelessNoun = channelType === CHANNEL.SHOPIFY_CHAT ? 'the visitor' : 'the customer';
  const actionableSteps = steps.filter((step) => step.category !== 'read');

  // The actual draft the merchant is approving, so approval is not sight-unseen.
  const draftBody = options?.rawToolCalls ? firstDraftExcerpt(options.rawToolCalls) : null;

  const lines: string[] = formatHeaderLines(customerName, channelType, summary, stage);

  // Directly under the header, because it qualifies the header: everything above
  // describes an anonymous storefront visitor, and this is the one fact that
  // makes disclosing order details to them correct rather than a leak. It still
  // names the mechanism — an email they had to receive — so the merchant can
  // judge what it is worth, but in the register a colleague would use. The
  // earlier "Verified: entered a code emailed to the address on #1024." asked
  // them to audit an authentication scheme to answer a shipping question.
  const verifiedOrders = options?.verifiedOrders ?? [];
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
    const only = parkedActionLabel(approvableSteps, customerName);
    lines.push('', only ? `I'd ${only}.` : `I'd ${lowerFirst(approvableSteps[0]!.label || approvableSteps[0]!.description)}.`);
    if (draftBody) lines.push('', `The reply: "${draftBody}"`);
  } else if (approvableSteps.length > 0) {
    const stepLines = approvableSteps.map((step, index) => {
      if (step.tool === 'send_reply') return `${index + 1}. Reply to ${firstName ?? namelessNoun}`;
      if (step.tool === 'send_email') return `${index + 1}. Email ${firstName ?? namelessNoun}`;
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
  } else {
    const replyOnly = approvableSteps.length > 0 && approvableSteps.every(isSendStep);
    lines.push('', replyOnly ? 'Good to send?' : 'Sound good?');
  }

  return lines.join('\n');
}

// The tool-result a revise/answer control tool returns to the model after re-drafting
// a plan. Unlike formatOperatorPlanMessage (the operator-facing card fanned out to
// the merchant's other channels), this is read by the model, which relays it in its
// own words — so it carries the concrete draft, not the yes/no card footer.
export function formatOperatorDraftSummary(
  customerName: string | null,
  plan: AgentPlan,
  surface: OperatorSurface = 'messaging',
): string {
  const name = customerName ? customerName.split(' ')[0] : 'the customer';
  const actionableSteps = plan.steps.filter((step) => step.category !== 'read');
  const stepList = actionableSteps.map((step) => step.label || step.description).join('; ');
  const draftBody = firstDraftExcerpt(plan.rawToolCalls);

  const parts = [
    `Re-drafted the plan for ${name} (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}: ${stepList}).`,
  ];
  if (draftBody) parts.push(`Draft: "${draftBody}"`);
  parts.push(surface === 'desk'
    ? "It's parked for the merchant's approval — they can approve it on the plan itself or ask for more changes."
    : "It's parked for the merchant's approval — they can reply yes to send it or ask for more changes.");
  return parts.join(' ');
}

function formatAutoExecutionMessage(
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
  const stepLines = actionableSteps.map((step, index) => `${index + 1}. ${step.description || step.label}`);
  const statusLine = result.autoExecutionStatus === 'error'
    ? 'I tried to handle this one myself but hit a problem:'
    : 'Handled this one myself:';

  const lines: (string | null)[] = [
    headline,
    endSentence(summary),
    '',
    statusLine,
    ...stepLines,
    result.autoExecutionSummary ? '' : null,
    result.autoExecutionSummary ?? null,
    result.autoExecutionError ? '' : null,
    result.autoExecutionError ? `Error: ${result.autoExecutionError}` : null,
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}

export async function sendOperatorAutoExecutionNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  requestSummary: string | null,
  result: PrecomputedPlanResult,
): Promise<void> {
  try {
    const bindings = await listOperatorBindings(organizationId);

    if (bindings.length === 0) {
      logger.info({ organizationId }, '[Worker] No bound operator members — skipping auto-execution notification');
      return;
    }

    const summary = requestSummary || result.instruction;
    const message = formatAutoExecutionMessage(customerName, channelType, summary, result.plan, result);

    const idempotencyKey = autoExecutionNotificationIdempotencyKey(
      organizationId,
      threadId,
      result.instruction,
    );

    if (result.identity) {
      await resolvePendingPlanContexts(
        organizationId,
        memberOperatorKey(bindings[0]!.orgMemberId),
        {
          threadId,
          instruction: result.instruction,
          rawToolCalls: result.plan.rawToolCalls,
          ...result.identity,
        },
      );
    }

    for (const member of bindings) {
      try {
        // Matching parked state was resolved conditionally above. Do not let a
        // late auto-execution notice erase an unrelated newer plan.
        const sent = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
        if (sent) {
          logger.info(
            { organizationId, threadId, chatId: sent.chatId, channel: sent.channel },
            '[Worker] Auto-execution notification sent',
          );
        } else {
          logger.warn(
            { organizationId, threadId, chatId: bindingDeliveryKey(member), channel: member.channel },
            '[Worker] Auto-execution notification failed',
          );
        }
      } catch (error) {
        logger.error(
          {
            err: (error as Error).message,
            organizationId,
            threadId,
            chatId: bindingDeliveryKey(member),
            channel: member.channel,
          },
          '[Worker] Auto-execution notification failed',
        );
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendOperatorAutoExecutionNotification error');
  }
}

function formatQuestionMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  question: string,
  stage: ConversationStage,
): string {
  return [
    ...formatHeaderLines(customerName, channelType, summary, stage),
    '',
    `${question} I'll draft the reply once I know.`,
  ].join('\n');
}

// Soft sibling of sendOperatorPlanNotification: the agent needs one fact from the
// merchant to finish the ticket. Pushes the question and parks `pendingQuestion`
// on each operator context so the next free-text reply is ingested as the answer.
export async function sendOperatorQuestionNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  requestSummary: string | null,
  question: string,
  instruction: string,
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping question notification');
    return;
  }

  const summary = requestSummary || instruction;
  const stage = await getConversationStage(threadId);
  const message = formatQuestionMessage(customerName, channelType, summary, question, stage);
  const idempotencyKey = questionNotificationIdempotencyKey(organizationId, threadId, question);

  // This thread's plan (if any) is superseded by the question. Remove only its
  // entry across devices — a whole-queue clear would drop other threads' plans.
  await removePendingPlanForThread(organizationId, threadId);

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body: message,
      contextPatch: {
        pendingQuestion: { threadId, question },
      },
      idempotencyKey,
    }),
    threadId,
    'Question notification',
  );
}

export async function sendOperatorPlanNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  requestSummary: string | null,
  plan: AgentPlan,
  instruction: string,
  options?: { exclude?: OperatorNotificationExclude; identity?: PlanIdentity },
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping plan notification');
    return;
  }

  const summary = requestSummary || instruction;
  const stage = await getConversationStage(threadId);
  const verifiedOrders = await listVerifiedOrderNames(organizationId, threadId, channelType);
  const dashboardUrl = getGatewayDashboardUrl();
  const idempotencyKey = planNotificationIdempotencyKey(
    organizationId,
    threadId,
    plan.rawToolCalls,
    instruction,
  );
  const actionLabel = parkedActionLabel(plan.steps, customerName);
  const maxDepth = getOperatorPlanQueueMax();
  const parkPlan: PendingPlan = {
    threadId,
    instruction,
    rawToolCalls: plan.rawToolCalls,
    ...(options?.identity ?? {}),
    ...(customerName ? { customerName } : {}),
    ...(actionLabel ? { actionLabel } : {}),
  };

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async (member) => {
      // Disclose what parking this card does to the operator's queue. Read here,
      // before notifyOperator appends the new plan, so it sees the prior queue.
      // Best-effort honesty, not a concurrency fix: a read failure must not widen
      // the critical push's failure surface, so drop the line silently.
      let queueNotice: QueueNotice | undefined;
      try {
        const existing = await getContext(organizationId, memberOperatorKey(member.orgMemberId));
        // A thread holds one pending plan, so a same-thread park is a replace, not
        // a stack — only other-thread plans matter for the disclosure.
        const others = existing.pendingPlans.filter((parked) => parked.threadId !== threadId);
        if (others.length > 0) {
          if (maxDepth === 1) {
            queueNotice = { kind: 'replaces', customerName: others[others.length - 1]!.customerName ?? null };
          } else if (others.length + 1 > maxDepth) {
            queueNotice = { kind: 'evicts', customerName: others[0]!.customerName ?? null };
          } else {
            queueNotice = { kind: 'stacked', waiting: others.length + 1 };
          }
        }
      } catch (error) {
        logger.warn(
          { err: (error as Error).message, organizationId, threadId },
          '[Worker] Queue-disclosure context read failed',
        );
      }

      return {
        body: formatOperatorPlanMessage(customerName, channelType, summary, plan.steps, {
          threadId,
          dashboardUrl,
          rawToolCalls: plan.rawToolCalls,
          stage,
          ...(verifiedOrders.length > 0 ? { verifiedOrders } : {}),
          ...(queueNotice ? { queueNotice } : {}),
        }),
        contextPatch: {},
        appendPlan: { plan: parkPlan, maxDepth },
        idempotencyKey,
      };
    },
    threadId,
    'Plan notification',
    options?.exclude,
  );
}

// Reports a degrade rather than asking for an approval, so it carries no pending
// state and no card — the merchant has nothing to decide here, only something to
// know. Sent once per billing period; the caller owns that marker, because the
// operator-notify dedupe is a one-hour Redis TTL and cannot express "once this
// month".
export async function sendConversationLimitNotification(
  organizationId: string,
  threadId: string,
  allowance: { tier: string; limit: number; used: number },
  period: string,
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping conversation limit notification');
    return;
  }

  // Names what stopped, what did not, and what fixes it. The middle clause is
  // the one that matters: a merchant who reads this must not think their
  // customers are being dropped.
  const body = [
    `You've passed your ${allowance.tier} plan's ${allowance.limit} conversations for this month — ${allowance.used} so far.`,
    '',
    "I've paused drafting plans for new conversations. Nothing is being dropped: messages still land in your inbox and you can reply to them yourself. Upgrade and I'll pick straight back up.",
  ].join('\n');

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body,
      contextPatch: {},
      idempotencyKey: `conversation-limit:${organizationId}:${period}`,
    }),
    threadId,
    'Conversation limit notification',
  );
}
