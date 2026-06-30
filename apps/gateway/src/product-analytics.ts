import {
  captureProductEvent,
  TOOL_CATEGORIES,
  TOOL_NAMES,
  initializeProductAnalytics,
  MESSAGE_CHANNELS,
  productEventInsertId,
  shutdownProductAnalytics,
  type ActionOutcome,
  type MessageChannel,
  type ReplySource,
  type ToolCategory,
  type ToolName,
} from '@shopkeeper/analytics';
import type { PersistedAgentAction } from '@shopkeeper/agent/agent-actions';
import { db, SenderType, type DbChannelType } from '@shopkeeper/db';
import logger from './logger.js';
import type { GatewayShutdownResource } from './workers/resources.js';

const ACTIVATION_INBOUND_CHANNELS: DbChannelType[] = [
  'email',
  'ig_dm',
  'imessage',
  'sms',
];
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export function initializeGatewayProductAnalytics(): void {
  initializeProductAnalytics({ delivery: 'batched', logger });
}

export function createProductAnalyticsShutdownResource(
  shutdown: () => Promise<void> = shutdownProductAnalytics,
): GatewayShutdownResource {
  return {
    label: 'product-analytics',
    close: shutdown,
  };
}

function analyticsChannel(channel: DbChannelType): MessageChannel | null {
  return (MESSAGE_CHANNELS as readonly string[]).includes(channel)
    ? channel as MessageChannel
    : null;
}

function warnResolutionFailure(operation: string, organizationId: string, error: unknown): void {
  logger.warn(
    {
      errorClass: error instanceof Error ? error.name : 'UnknownError',
      organizationId,
      operation,
    },
    '[ProductAnalytics] Gateway event context resolution failed',
  );
}

export async function captureInboundMessageProcessed(args: {
  channel: DbChannelType;
  messageId: string;
  organizationId: string;
}): Promise<void> {
  try {
    const channel = analyticsChannel(args.channel);
    if (!channel) return;

    const inboundCount = await db.message.count({
      where: {
        organizationId: args.organizationId,
        senderType: SenderType.customer,
        thread: { channelType: { in: ACTIVATION_INBOUND_CHANNELS } },
      },
    });

    await captureProductEvent({
      event: 'inbound_message_processed',
      organizationId: args.organizationId,
      source: 'gateway',
      channel,
      isFirstForWorkspace: inboundCount === 1,
      insertId: productEventInsertId.inboundMessageProcessed(args.messageId),
    });
  } catch (error) {
    warnResolutionFailure('inbound_message_processed', args.organizationId, error);
  }
}

export async function captureAgentPlanGenerated(args: {
  cacheHit: boolean;
  channel: DbChannelType;
  generationMs: number;
  organizationId: string;
  planId: string;
  stepCount: number;
}): Promise<void> {
  try {
    const channel = analyticsChannel(args.channel);
    if (!channel) return;

    await captureProductEvent({
      event: 'agent_plan_generated',
      organizationId: args.organizationId,
      source: 'gateway',
      channel,
      planSource: args.cacheHit ? 'cached' : 'generated',
      stepCount: args.stepCount,
      generationMs: Math.max(0, Math.floor(args.generationMs)),
      cacheHit: args.cacheHit,
      insertId: productEventInsertId.agentPlanGenerated(args.planId),
    });
  } catch (error) {
    warnResolutionFailure('agent_plan_generated', args.organizationId, error);
  }
}

export function captureAgentActionsCompleted(actions: PersistedAgentAction[]): void {
  for (const action of actions) {
    if (
      !(TOOL_NAMES as readonly string[]).includes(action.tool)
      || !(TOOL_CATEGORIES as readonly string[]).includes(action.category)
    ) {
      continue;
    }

    const outcome: ActionOutcome = action.status === 'success'
      ? 'succeeded'
      : action.status === 'error'
        ? 'failed'
        : 'blocked';
    void captureProductEvent({
      event: 'agent_action_completed',
      organizationId: action.organizationId,
      source: 'gateway',
      toolName: action.tool as ToolName,
      toolCategory: action.category as ToolCategory,
      outcome,
      insertId: productEventInsertId.agentActionCompleted(action.id),
    });
  }
}

export async function captureOutboundReplySent(args: {
  channel: DbChannelType;
  messageId: string;
  organizationId: string;
  replySource: ReplySource;
}): Promise<void> {
  try {
    const channel = analyticsChannel(args.channel);
    if (!channel) return;

    await captureProductEvent({
      event: 'outbound_reply_sent',
      organizationId: args.organizationId,
      source: 'gateway',
      channel,
      replySource: args.replySource,
      insertId: productEventInsertId.outboundReplySent(args.messageId),
    });

    if (args.replySource !== 'manual') {
      await captureWorkspaceActivation(args.organizationId);
    }
  } catch (error) {
    warnResolutionFailure('outbound_reply_sent', args.organizationId, error);
  }
}

export async function captureWorkspaceActivation(organizationId: string): Promise<void> {
  try {
    const [organization, integrations, inboundMessageCount] = await Promise.all([
      db.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true },
      }),
      db.integration.findMany({
        where: {
          organizationId,
          OR: [
            { platform: 'shopify', accessToken: { not: null } },
            { platform: 'email' },
          ],
        },
        select: { platform: true },
      }),
      db.message.count({
        where: {
          organizationId,
          senderType: SenderType.customer,
          thread: { channelType: { in: ACTIVATION_INBOUND_CHANNELS } },
        },
      }),
    ]);

    if (!organization || inboundMessageCount === 0) return;

    const connectedPlatforms = new Set(integrations.map(({ platform }) => platform));
    if (!connectedPlatforms.has('shopify') || !connectedPlatforms.has('email')) return;

    const secondsSinceWorkspaceCreated = Math.max(
      0,
      Math.floor((Date.now() - organization.createdAt.getTime()) / 1_000),
    );

    await captureProductEvent({
      event: 'workspace_activated',
      organizationId,
      source: 'gateway',
      secondsSinceWorkspaceCreated,
      withinSevenDays: secondsSinceWorkspaceCreated <= SEVEN_DAYS_SECONDS,
      insertId: productEventInsertId.workspaceActivated(organizationId),
    });
  } catch (error) {
    warnResolutionFailure('workspace_activated', organizationId, error);
  }
}
