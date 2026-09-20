import {
  captureProductEvent,
  TOOL_CATEGORIES,
  TOOL_NAMES,
  ACTIVATION_INBOUND_CHANNELS,
  WORKSPACE_ACTIVATION_WINDOW_SECONDS,
  agentActionOutcome,
  initializeProductAnalytics,
  productEventInsertId,
  shutdownProductAnalytics,
  toProductMessageChannel,
  type ReplySource,
  type ToolCategory,
  type ToolName,
} from '@shopkeeper/analytics';
import type { PersistedAgentAction } from '@shopkeeper/agent/agent-actions';
import { db, loadWorkspaceActivationSnapshot, SenderType, type DbChannelType } from '@shopkeeper/db';
import logger from './logger.js';
import type { GatewayShutdownResource } from './workers/resources.js';

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
    const channel = toProductMessageChannel(args.channel);
    if (!channel) return;

    const inboundCount = await db.message.count({
      where: {
        organizationId: args.organizationId,
        senderType: SenderType.customer,
        thread: { channelType: { in: [...ACTIVATION_INBOUND_CHANNELS] } },
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
    const channel = toProductMessageChannel(args.channel);
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

    void captureProductEvent({
      event: 'agent_action_completed',
      organizationId: action.organizationId,
      source: 'gateway',
      toolName: action.tool as ToolName,
      toolCategory: action.category as ToolCategory,
      outcome: agentActionOutcome(action.status),
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
    const channel = toProductMessageChannel(args.channel);
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
    const snapshot = await loadWorkspaceActivationSnapshot(organizationId);
    if (!snapshot) return;

    const secondsSinceWorkspaceCreated = Math.max(
      0,
      Math.floor((Date.now() - snapshot.organizationCreatedAt.getTime()) / 1_000),
    );

    await captureProductEvent({
      event: 'workspace_activated',
      organizationId,
      source: 'gateway',
      secondsSinceWorkspaceCreated,
      withinSevenDays: secondsSinceWorkspaceCreated <= WORKSPACE_ACTIVATION_WINDOW_SECONDS,
      insertId: productEventInsertId.workspaceActivated(organizationId),
    });
  } catch (error) {
    warnResolutionFailure('workspace_activated', organizationId, error);
  }
}
