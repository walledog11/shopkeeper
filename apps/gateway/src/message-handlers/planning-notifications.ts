import type { DbChannelType } from '@shopkeeper/db';
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
import type { PrecomputedPlanResult } from './planning-types.js';

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

export function formatOperatorPlanMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  steps: PlanStep[],
  options?: { threadId?: string; dashboardUrl?: string },
): string {
  const channel = formatChannelLabel(channelType);
  const actionableSteps = steps.filter((step) => step.category !== 'read');

  const stepLines = actionableSteps.map((step, index) => {
    if (step.tool === 'send_reply' || step.tool === 'send_email') {
      const firstName = customerName ? customerName.split(' ')[0] : 'the customer';
      return `${index + 1}. Email ${firstName}`;
    }
    const text = step.label || step.description;
    return `${index + 1}. ${text}`;
  });

  const lines: (string | null)[] = [
    `New ticket — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `"${summary}"`,
    '',
    `Plan (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}):`,
    ...stepLines,
  ];

  if (options?.threadId && options.dashboardUrl) {
    lines.push('', `Open: ${options.dashboardUrl}/dashboard/tickets/${options.threadId}`);
  }

  const actions = actionableSteps.length > 1 ? ['yes', 'no', 'skip 1'] : ['yes', 'no'];
  if (options?.threadId && options.dashboardUrl) {
    actions.push('Open link above');
  }
  lines.push('', actions.join(' · '));

  return lines.filter((line): line is string => line !== null).join('\n');
}

function formatAutoExecutionMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  plan: AgentPlan,
  result: PrecomputedPlanResult,
): string {
  const channel = formatChannelLabel(channelType);
  const actionableSteps = plan.steps.filter((step) => step.category !== 'read');
  const stepLines = actionableSteps.map((step, index) => `${index + 1}. ${step.description || step.label}`);
  const statusLine = result.autoExecutionStatus === 'error'
    ? 'Auto-execution needs attention.'
    : 'Auto-executed by the agent.';

  const lines: (string | null)[] = [
    statusLine,
    `Ticket — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `"${summary}"`,
    '',
    `Completed plan (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}):`,
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

    for (const member of bindings) {
      try {
        const sent = await notifyOperator(organizationId, member, message, {
          lastThreadId: threadId,
          pendingPlan: null,
        }, { idempotencyKey });
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
): string {
  const channel = formatChannelLabel(channelType);

  const lines: (string | null)[] = [
    `Needs your input — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `"${summary}"`,
    '',
    question,
    '',
    'Reply here to answer and I’ll draft the response.',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
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
  const message = formatQuestionMessage(customerName, channelType, summary, question);
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
  options?: { exclude?: OperatorNotificationExclude },
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping plan notification');
    return;
  }

  const summary = aiSummary || instruction;
  const message = formatOperatorPlanMessage(customerName, channelType, summary, plan.steps, {
    threadId,
    dashboardUrl: getGatewayDashboardUrl(),
  });
  const idempotencyKey = planNotificationIdempotencyKey(
    organizationId,
    threadId,
    plan.rawToolCalls,
    instruction,
  );

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body: message,
      contextPatch: {
        pendingPlan: { threadId, instruction, rawToolCalls: plan.rawToolCalls },
      },
      idempotencyKey,
    }),
    threadId,
    'Plan notification',
    options?.exclude,
  );
}
