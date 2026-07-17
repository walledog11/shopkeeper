import { db, type DbChannelType } from '@shopkeeper/db';
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
  listOperatorBindings,
  notifyOperator,
  OperatorNotifyError,
  type OperatorBinding,
} from '../operator-notify.js';
import type { AgentPlan, PlanStep } from '../types.js';
import type { PlanIdentity, PrecomputedPlanResult } from './planning-types.js';
import { firstDraftExcerpt } from './operator-ledger.js';
import { resolvePendingPlanContexts } from '../operator-context.js';

export interface OperatorNotificationExclude {
  channel: OperatorBinding['channel'];
  contextKey: string;
}

function operatorContextKey(member: OperatorBinding): string {
  return member.channel === 'telegram' ? member.chatId : member.senderId;
}

function shouldExcludeMember(
  member: OperatorBinding,
  exclude: OperatorNotificationExclude | undefined,
): boolean {
  if (!exclude || member.channel !== exclude.channel) return false;
  return operatorContextKey(member) === exclude.contextKey;
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
  }>,
  threadId: string,
  logLabel: string,
  exclude?: OperatorNotificationExclude,
): Promise<void> {
  let delivered = 0;
  let lastError: unknown;

  for (const member of bindings) {
    if (shouldExcludeMember(member, exclude)) continue;

    const { body, contextPatch, idempotencyKey } = await notify(member);
    try {
      const result = await notifyOperator(organizationId, member, body, contextPatch, {
        policy: 'critical',
        threadId,
        idempotencyKey,
      });
      if (result) {
        delivered += 1;
        logger.info(
          { organizationId, threadId, chatId: result.chatId, channel: result.channel },
          `[Worker] ${logLabel} sent`,
        );
      } else {
        logger.warn(
          { organizationId, threadId, chatId: operatorContextKey(member), channel: member.channel },
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
          chatId: operatorContextKey(member),
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

// Fresh conversation vs. ongoing chain, from the thread's real history: any
// message before the trailing run of customer texts means the merchant has seen
// this conversation before; the trailing run itself is the unanswered burst.
export async function getConversationStage(threadId: string): Promise<ConversationStage> {
  const messages = await db.message.findMany({
    where: { threadId, deletedAt: null, senderType: { in: ['customer', 'agent', 'ai'] } },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { senderType: true },
  });
  let trailing = 0;
  for (const message of messages) {
    if (message.senderType === 'customer') trailing += 1;
    else trailing = 0;
  }
  return {
    isFollowUp: messages.length > trailing,
    newMessages: Math.max(trailing, 1),
  };
}

// In-sentence channel wording: "New Instagram DM from Jane", "Jane replied on Instagram".
function channelNoun(channelType: DbChannelType): string {
  if (channelType === CHANNEL.IG_DM) return 'Instagram DM';
  if (channelType === CHANNEL.EMAIL) return 'email';
  if (channelType === CHANNEL.TIKTOK) return 'TikTok message';
  return `${formatChannelLabel(channelType)} message`;
}

function channelRepliedPhrase(channelType: DbChannelType): string {
  if (channelType === CHANNEL.IG_DM) return 'on Instagram';
  if (channelType === CHANNEL.EMAIL) return 'by email';
  if (channelType === CHANNEL.TIKTOK) return 'on TikTok';
  return `on ${formatChannelLabel(channelType)}`;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function customerFirstName(customerName: string | null): string | null {
  return customerName ? customerName.split(' ')[0] ?? null : null;
}

function formatHeaderLine(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  stage: ConversationStage,
): string {
  const firstName = customerFirstName(customerName);
  let lead: string;
  if (stage.isFollowUp) {
    const who = firstName ?? 'The customer';
    lead = stage.newMessages > 1
      ? `${who} sent ${stage.newMessages} more messages ${channelRepliedPhrase(channelType)}`
      : `${who} replied ${channelRepliedPhrase(channelType)}`;
  } else {
    const from = firstName ? ` from ${firstName}` : '';
    const burst = stage.newMessages > 1 ? ` (${stage.newMessages} messages)` : '';
    lead = `New ${channelNoun(channelType)}${from}${burst}`;
  }
  return `${lead} — ${lowerFirst(summary)}`;
}

function isSendStep(step: PlanStep): boolean {
  return step.tool === 'send_reply' || step.tool === 'send_email';
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
  },
): string {
  const stage = options?.stage ?? FRESH_STAGE;
  const firstName = customerFirstName(customerName);
  const actionableSteps = steps.filter((step) => step.category !== 'read');

  // The actual draft the merchant is approving, so approval is not sight-unseen.
  const draftBody = options?.rawToolCalls ? firstDraftExcerpt(options.rawToolCalls) : null;

  const lines: string[] = [formatHeaderLine(customerName, channelType, summary, stage)];

  if (actionableSteps.length === 1 && isSendStep(actionableSteps[0]!) && draftBody) {
    lines.push('', "I'd reply:", `"${draftBody}"`);
  } else if (actionableSteps.length > 0) {
    const stepLines = actionableSteps.map((step, index) => {
      if (step.tool === 'send_reply') return `${index + 1}. Reply to ${firstName ?? 'the customer'}`;
      if (step.tool === 'send_email') return `${index + 1}. Email ${firstName ?? 'the customer'}`;
      return `${index + 1}. ${step.label || step.description}`;
    });
    lines.push('', "Here's what I'd do:", ...stepLines);
    if (draftBody) lines.push('', `The reply: "${draftBody}"`);
  }

  if (options?.threadId && options.dashboardUrl) {
    lines.push('', `Full thread: ${options.dashboardUrl}/dashboard/tickets/${options.threadId}`);
  }

  const replyOnly = actionableSteps.length > 0 && actionableSteps.every(isSendStep);
  lines.push('', replyOnly ? 'Good to send?' : 'Sound good?');

  return lines.join('\n');
}

// The tool-result a revise/answer control tool returns to the model after re-drafting
// a plan. Unlike formatOperatorPlanMessage (the operator-facing card fanned out to
// the merchant's other channels), this is read by the model, which relays it in its
// own words — so it carries the concrete draft, not the yes/no card footer.
export function formatOperatorDraftSummary(customerName: string | null, plan: AgentPlan): string {
  const name = customerName ? customerName.split(' ')[0] : 'the customer';
  const actionableSteps = plan.steps.filter((step) => step.category !== 'read');
  const stepList = actionableSteps.map((step) => step.label || step.description).join('; ');
  const draftBody = firstDraftExcerpt(plan.rawToolCalls);

  const parts = [
    `Re-drafted the plan for ${name} (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}: ${stepList}).`,
  ];
  if (draftBody) parts.push(`Draft: "${draftBody}"`);
  parts.push("It's parked for the merchant's approval — they can reply yes to send it or ask for more changes.");
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
    ? `${firstName}'s ${noun} — ${lowerFirst(summary)}`
    : `${noun.charAt(0).toUpperCase()}${noun.slice(1)} — ${lowerFirst(summary)}`;
  const actionableSteps = plan.steps.filter((step) => step.category !== 'read');
  const stepLines = actionableSteps.map((step, index) => `${index + 1}. ${step.description || step.label}`);
  const statusLine = result.autoExecutionStatus === 'error'
    ? 'I tried to handle this one myself but hit a problem:'
    : 'Handled this one myself:';

  const lines: (string | null)[] = [
    headline,
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
  aiSummary: string | null,
  result: PrecomputedPlanResult,
): Promise<void> {
  try {
    const bindings = await listOperatorBindings(organizationId);

    if (bindings.length === 0) {
      logger.info({ organizationId }, '[Worker] No bound operator members — skipping auto-execution notification');
      return;
    }

    const summary = aiSummary || result.instruction;
    const message = formatAutoExecutionMessage(customerName, channelType, summary, result.plan, result);

    const idempotencyKey = autoExecutionNotificationIdempotencyKey(
      organizationId,
      threadId,
      result.instruction,
    );

    if (result.identity) {
      await resolvePendingPlanContexts(
        organizationId,
        operatorContextKey(bindings[0]!),
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
            { organizationId, threadId, chatId: operatorContextKey(member), channel: member.channel },
            '[Worker] Auto-execution notification failed',
          );
        }
      } catch (error) {
        logger.error(
          {
            err: (error as Error).message,
            organizationId,
            threadId,
            chatId: operatorContextKey(member),
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
    formatHeaderLine(customerName, channelType, summary, stage),
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
  aiSummary: string | null,
  question: string,
  instruction: string,
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping question notification');
    return;
  }

  const summary = aiSummary || instruction;
  const stage = await getConversationStage(threadId);
  const message = formatQuestionMessage(customerName, channelType, summary, question, stage);
  const idempotencyKey = questionNotificationIdempotencyKey(organizationId, threadId, question);

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body: message,
      contextPatch: {
        pendingPlan: null,
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
  aiSummary: string | null,
  plan: AgentPlan,
  instruction: string,
  options?: { exclude?: OperatorNotificationExclude; identity?: PlanIdentity },
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping plan notification');
    return;
  }

  const summary = aiSummary || instruction;
  const stage = await getConversationStage(threadId);
  const message = formatOperatorPlanMessage(customerName, channelType, summary, plan.steps, {
    threadId,
    dashboardUrl: getGatewayDashboardUrl(),
    rawToolCalls: plan.rawToolCalls,
    stage,
  });
  const idempotencyKey = planNotificationIdempotencyKey(
    organizationId,
    threadId,
    plan.rawToolCalls,
    instruction,
  );
  const actionLabel = parkedActionLabel(plan.steps, customerName);

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body: message,
      contextPatch: {
        pendingPlan: {
          threadId,
          instruction,
          rawToolCalls: plan.rawToolCalls,
          ...(options?.identity ?? {}),
          ...(customerName ? { customerName } : {}),
          ...(actionLabel ? { actionLabel } : {}),
        },
      },
      idempotencyKey,
    }),
    threadId,
    'Plan notification',
    options?.exclude,
  );
}
