import type { DbChannelType } from '@shopkeeper/db';
import logger from '../logger.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import { formatChannelLabel } from '../lib/channel-format.js';
import { listOperatorBindings, notifyOperator, type OperatorBinding } from '../operator-notify.js';
import type { AgentPlan, PlanStep } from '../types.js';
import type { PrecomputedPlanResult } from './planning-types.js';

export interface OperatorNotificationExclude {
  channel: OperatorBinding['channel'];
  contextKey: string;
}

function operatorContextKey(member: OperatorBinding): string {
  return member.channel === 'telegram' ? member.chatId : member.senderId;
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

    for (const member of bindings) {
      try {
        const sent = await notifyOperator(organizationId, member, message, {
          lastThreadId: threadId,
          pendingPlan: null,
        });
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

  for (const member of bindings) {
    try {
      const result = await notifyOperator(organizationId, member, message, {
        pendingPlan: null,
        pendingQuestion: { threadId, question },
      }, {
        policy: 'critical',
        threadId,
      });
      if (result) {
        logger.info(
          { organizationId, threadId, chatId: result.chatId, channel: result.channel },
          '[Worker] Question notification sent',
        );
      } else {
        logger.warn(
          { organizationId, threadId, chatId: operatorContextKey(member), channel: member.channel },
          '[Worker] Question notification failed',
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
        '[Worker] Question notification failed',
      );
      throw error;
    }
  }
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
  const exclude = options?.exclude;

  for (const member of bindings) {
    if (exclude && member.channel === exclude.channel) {
      const contextKey = operatorContextKey(member);
      if (contextKey === exclude.contextKey) continue;
    }

    try {
      const result = await notifyOperator(organizationId, member, message, {
        pendingPlan: { threadId, instruction, rawToolCalls: plan.rawToolCalls },
      }, {
        policy: 'critical',
        threadId,
      });
      if (result) {
        logger.info(
          { organizationId, threadId, chatId: result.chatId, channel: result.channel },
          '[Worker] Plan notification sent',
        );
      } else {
        logger.warn(
          { organizationId, threadId, chatId: operatorContextKey(member), channel: member.channel },
          '[Worker] Plan notification failed',
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
        '[Worker] Plan notification failed',
      );
      throw error;
    }
  }
}
