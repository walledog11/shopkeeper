import { db, type DbChannelType } from '@shopkeeper/db';
import logger from '../logger.js';
import { formatChannelLabel } from '../lib/channel-format.js';
import { notifyOperator } from '../operator-notify.js';
import type { AgentPlan, PlanStep } from '../types.js';
import type { PrecomputedPlanResult } from './planning-types.js';

function formatPlanMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  steps: PlanStep[],
): string {
  const channel = formatChannelLabel(channelType);
  const actionableSteps = steps.filter((step) => step.category !== 'read');

  const stepLines = actionableSteps.map((step, index) => {
    let text: string;
    if (step.tool === 'send_reply' || step.tool === 'send_email') {
      const firstName = customerName ? customerName.split(' ')[0] : 'the customer';
      text = `Email ${firstName} and let them know.`;
    } else {
      text = step.description || step.label;
    }
    return `${index + 1}. ${text}`;
  });

  const lines: (string | null)[] = [
    `New ticket — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `"${summary}"`,
    '',
    `Proposed plan (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}):`,
    ...stepLines,
    '',
    'Sound good? Reply yes to go ahead or no to skip.',
  ];

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
    const chats = await db.orgMemberTelegramChat.findMany({
      where: { orgMember: { organizationId } },
      select: { chatId: true },
    });

    if (chats.length === 0) {
      logger.info({ organizationId }, '[Worker] No bound operator members — skipping auto-execution notification');
      return;
    }

    const summary = aiSummary || result.instruction;
    const message = formatAutoExecutionMessage(customerName, channelType, summary, result.plan, result);

    for (const member of chats) {
      const sent = await notifyOperator(organizationId, member, message, {
        lastThreadId: threadId,
        pendingPlan: null,
      });
      if (sent) {
        logger.info(
          { organizationId, threadId, chatId: sent.chatId },
          '[Worker] Auto-execution notification sent',
        );
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendOperatorAutoExecutionNotification error');
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
): Promise<void> {
  const chats = await db.orgMemberTelegramChat.findMany({
    where: { orgMember: { organizationId } },
    select: { chatId: true },
  });

  if (chats.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping plan notification');
    return;
  }

  const summary = aiSummary || instruction;
  const message = formatPlanMessage(customerName, channelType, summary, plan.steps);

  for (const member of chats) {
    const result = await notifyOperator(organizationId, member, message, {
      pendingPlan: { threadId, instruction, rawToolCalls: plan.rawToolCalls },
    }, {
      policy: 'critical',
      threadId,
    });
    if (result) {
      logger.info(
        { organizationId, threadId, chatId: result.chatId },
        '[Worker] Plan notification sent',
      );
    }
  }
}
