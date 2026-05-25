import { db, type DbChannelType } from '@clerk/db';
import * as Sentry from '@sentry/node';
import { getGatewayDashboardUrl } from '../config/env.js';
import logger from '../logger.js';
import { CHANNEL, STATUS } from '../constants.js';
import type { AgentPlan, PlanStep } from '../types.js';
import { notifyOperator } from '../operator-notify.js';
import { getInternalApiSecret } from './shared.js';

interface AgentActionResult {
  tool: string;
  result: string;
}

interface PrecomputedPlanResult {
  plan: AgentPlan;
  instruction: string;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}

function formatPlanMessage(customerName: string | null, channelType: DbChannelType, summary: string, steps: PlanStep[]): string {
  const channel = channelType === CHANNEL.IG_DM ? 'Instagram DM' : channelType.charAt(0).toUpperCase() + channelType.slice(1);
  const actionableSteps = steps.filter((s) => s.category !== 'read');

  const stepLines = actionableSteps.map((s, i) => {
    let text: string;
    if (s.tool === 'send_reply' || s.tool === 'send_email') {
      const firstName = customerName ? customerName.split(' ')[0] : 'the customer';
      text = `Email ${firstName} and let them know.`;
    } else {
      text = s.description || s.label;
    }
    return `${i + 1}. ${text}`;
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

  return lines.filter((l): l is string => l !== null).join('\n');
}

function formatAutoExecutionMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  plan: AgentPlan,
  result: PrecomputedPlanResult,
): string {
  const channel = channelType === CHANNEL.IG_DM ? 'Instagram DM' : channelType.charAt(0).toUpperCase() + channelType.slice(1);
  const actionableSteps = plan.steps.filter((s) => s.category !== 'read');
  const stepLines = actionableSteps.map((s, i) => `${i + 1}. ${s.description || s.label}`);
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

  return lines.filter((l): l is string => l !== null).join('\n');
}

export async function precomputeThreadPlan(
  organizationId: string,
  threadId: string,
  settings: Record<string, unknown>,
  options: { allowAutoExecute?: boolean } = {},
): Promise<PrecomputedPlanResult | null> {
  if (settings.autoPlanOnOpen === false) {
    logger.warn({ threadId, organizationId }, '[Worker] autoPlanOnOpen disabled — no plan will be generated for this thread');
    return null;
  }

  try {
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: { status: true },
    });
    if (!thread || thread.status !== STATUS.OPEN) {
      return null;
    }

    const planRes = await fetch(`${getGatewayDashboardUrl()}/api/agent/plan-internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({
        orgId: organizationId,
        threadId,
        allowAutoExecute: options.allowAutoExecute === true,
      }),
    });

    if (!planRes.ok) {
      const responseBody = await planRes.text().catch(() => '');
      logger.warn(
        { status: planRes.status, threadId, organizationId, responseBody: responseBody.slice(0, 500) },
        '[Worker] plan-internal failed during precompute',
      );
      throw new Error(`plan-internal returned ${planRes.status}: ${responseBody.slice(0, 200)}`);
    }

    const {
      plan,
      instruction,
      autoExecuted,
      autoExecutionStatus,
      autoExecutionSummary,
      autoExecutionActions,
      autoExecutionError,
    } = await planRes.json() as {
      plan: AgentPlan | null;
      instruction: string;
      autoExecuted?: boolean;
      autoExecutionStatus?: 'success' | 'error';
      autoExecutionSummary?: string;
      autoExecutionActions?: AgentActionResult[];
      autoExecutionError?: string;
    };
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return null;
    }
    return {
      plan,
      instruction,
      ...(autoExecuted ? {
        autoExecuted: true,
        autoExecutionStatus,
        autoExecutionSummary,
        autoExecutionActions,
        autoExecutionError,
      } : {}),
    };
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId, organizationId }, '[Worker] precomputeThreadPlan error');
    Sentry.captureException(err, {
      tags: { path: 'plan-precompute' },
      extra: { threadId, organizationId },
    });
    throw err;
  }
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
    const members = await db.orgMember.findMany({
      where: { organizationId, telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });

    if (members.length === 0) {
      logger.info({ organizationId }, '[Worker] No bound operator members — skipping auto-execution notification');
      return;
    }

    const summary = aiSummary || result.instruction;
    const message = formatAutoExecutionMessage(customerName, channelType, summary, result.plan, result);

    for (const member of members) {
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
  try {
    const members = await db.orgMember.findMany({
      where: { organizationId, telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });

    if (members.length === 0) {
      logger.info({ organizationId }, '[Worker] No bound operator members — skipping plan notification');
      return;
    }

    const summary = aiSummary || instruction;
    const message = formatPlanMessage(customerName, channelType, summary, plan.steps);

    for (const member of members) {
      const result = await notifyOperator(organizationId, member, message, {
        pendingPlan: { threadId, instruction, rawToolCalls: plan.rawToolCalls },
      });
      if (result) {
        logger.info(
          { organizationId, threadId, chatId: result.chatId },
          '[Worker] Plan notification sent',
        );
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendOperatorPlanNotification error');
  }
}

interface BusinessHoursSettings {
  businessHoursEnabled: boolean;
  businessHoursDays: string[];
  businessHoursStart: number;
  businessHoursEnd: number;
  businessHoursTimezone: string;          // IANA — preferred
  businessHoursTimezoneOffset: number;    // legacy fallback
}

const BUSINESS_HOURS_DEFAULTS: BusinessHoursSettings = {
  businessHoursEnabled: false,
  businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursTimezone: '',
  businessHoursTimezoneOffset: 0,
};

function offsetToIanaFallback(offset: number): string {
  const rounded = Math.max(-12, Math.min(14, Math.round(offset)));
  if (rounded === 0) return 'UTC';
  return `Etc/GMT${rounded > 0 ? '-' : '+'}${Math.abs(rounded)}`;
}

export function resolveBusinessHoursSettings(raw: Record<string, unknown>): BusinessHoursSettings {
  const rawTz = raw.businessHoursTimezone;
  return {
    businessHoursEnabled: (raw.businessHoursEnabled as boolean) ?? BUSINESS_HOURS_DEFAULTS.businessHoursEnabled,
    businessHoursDays: (raw.businessHoursDays as string[]) ?? BUSINESS_HOURS_DEFAULTS.businessHoursDays,
    businessHoursStart: (raw.businessHoursStart as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursStart,
    businessHoursEnd: (raw.businessHoursEnd as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursEnd,
    businessHoursTimezone: typeof rawTz === 'string' ? rawTz : BUSINESS_HOURS_DEFAULTS.businessHoursTimezone,
    businessHoursTimezoneOffset: (raw.businessHoursTimezoneOffset as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursTimezoneOffset,
  };
}

export function isWithinBusinessHours(settings: BusinessHoursSettings): boolean {
  if (!settings.businessHoursEnabled) return true;

  const tzName = settings.businessHoursTimezone.trim() !== ''
    ? settings.businessHoursTimezone
    : offsetToIanaFallback(settings.businessHoursTimezoneOffset);

  const now = new Date();
  let localHour: number;
  let localDay: string;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    localHour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    localDay = parts.find((p) => p.type === 'weekday')!.value.toLowerCase().slice(0, 3);
  } catch {
    localHour = now.getUTCHours();
    localDay = now.toUTCString().slice(0, 3).toLowerCase();
  }

  const withinHours = settings.businessHoursEnd > settings.businessHoursStart
    ? localHour >= settings.businessHoursStart && localHour < settings.businessHoursEnd
    : localHour >= settings.businessHoursStart || localHour < settings.businessHoursEnd;

  return settings.businessHoursDays.includes(localDay) && withinHours;
}

export async function sendAutoAck(organizationId: string, threadId: string): Promise<void> {
  try {
    const res = await fetch(`${getGatewayDashboardUrl()}/api/messages/auto-ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({ threadId }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, threadId, organizationId }, '[Worker] Auto-ack dispatch failed');
    } else {
      const body = await res.json() as { ok: boolean; skipped?: boolean };
      if (body.skipped) {
        logger.warn({ threadId, organizationId }, '[Worker] Auto-ack skipped by dashboard — check businessHoursEnabled setting sync');
      } else {
        logger.info({ threadId, organizationId }, '[Worker] Auto-ack sent to customer');
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendAutoAck error');
  }
}
