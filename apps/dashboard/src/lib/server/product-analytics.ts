import {
  captureProductEvent,
  initializeProductAnalytics,
  productEventInsertId,
  TOOL_CATEGORIES,
  TOOL_NAMES,
  WORKSPACE_ACTIVATION_WINDOW_SECONDS,
  agentActionOutcome,
  toProductMessageChannel,
  type IntegrationFailureCategory,
  type IntegrationPlatform,
  type MessageChannel,
  type PlanDecision,
  type ProductEvent,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type ReplySource,
  type ToolCategory,
  type ToolName,
} from '@shopkeeper/analytics';
import type { PersistedAgentAction } from '@shopkeeper/agent/agent-actions';
import { db, loadWorkspaceActivationSnapshot } from '@shopkeeper/db';
import logger from '@/lib/server/logger';

let initializationAttempted = false;

function ensureDashboardProductAnalytics(): void {
  // Tests install a RecordingAnalyticsSink explicitly. Initializing here would
  // replace it and could make tests issue real PostHog requests.
  if (process.env.NODE_ENV === 'test' || initializationAttempted) return;

  initializationAttempted = true;

  try {
    initializeProductAnalytics({ delivery: 'immediate', logger });
  } catch (error) {
    logger.warn(
      {
        errorClass: error instanceof Error ? error.name : 'UnknownError',
      },
      '[ProductAnalytics] Dashboard initialization failed',
    );
  }
}

export async function captureDashboardProductEvent(event: ProductEvent): Promise<void> {
  ensureDashboardProductAnalytics();
  await captureProductEvent(event);
}

export async function captureIntegrationConnectionCompleted(args: {
  integrationId: string;
  organizationId: string;
  platform: IntegrationPlatform;
}): Promise<void> {
  await captureDashboardProductEvent({
    event: 'integration_connection_completed',
    organizationId: args.organizationId,
    source: 'dashboard',
    platform: args.platform,
    insertId: productEventInsertId.integrationConnectionCompleted(args.integrationId),
  });
}

export async function captureIntegrationConnectionFailed(args: {
  attemptId?: string;
  failureCategory: IntegrationFailureCategory;
  organizationId: string;
  platform: IntegrationPlatform;
}): Promise<void> {
  await captureDashboardProductEvent({
    event: 'integration_connection_failed',
    organizationId: args.organizationId,
    source: 'dashboard',
    platform: args.platform,
    failureCategory: args.failureCategory,
    ...(args.attemptId
      ? { insertId: productEventInsertId.integrationConnectionFailed(args.attemptId) }
      : {}),
  });
}

export async function captureOAuthIntegrationConnectionFailed(args: {
  attemptId?: string;
  clerkOrganizationId?: string;
  failureCategory: IntegrationFailureCategory;
  platform: IntegrationPlatform;
}): Promise<void> {
  if (!args.clerkOrganizationId) return;

  try {
    const organization = await db.organization.findUnique({
      where: { clerkOrgId: args.clerkOrganizationId },
      select: { id: true },
    });
    if (!organization) return;

    await captureIntegrationConnectionFailed({
      attemptId: args.attemptId,
      failureCategory: args.failureCategory,
      organizationId: organization.id,
      platform: args.platform,
    });
  } catch (error) {
    logger.warn(
      {
        errorClass: error instanceof Error ? error.name : 'UnknownError',
        platform: args.platform,
      },
      '[ProductAnalytics] OAuth failure context resolution failed',
    );
  }
}

export async function captureSubscriptionStatusChanged(args: {
  newStatus: SubscriptionStatus;
  organizationId: string;
  plan: SubscriptionPlan;
  previousStatus: SubscriptionStatus;
  stripeEventId: string;
}): Promise<void> {
  if (args.previousStatus === args.newStatus) return;

  await captureDashboardProductEvent({
    event: 'subscription_status_changed',
    organizationId: args.organizationId,
    source: 'dashboard',
    previousStatus: args.previousStatus,
    newStatus: args.newStatus,
    plan: args.plan,
    insertId: productEventInsertId.subscriptionStatusChanged(args.stripeEventId),
  });
}

export async function captureAgentPlanGenerated(args: {
  cacheHit: boolean;
  channel: MessageChannel;
  generationMs: number;
  organizationId: string;
  planId: string;
  stepCount: number;
}): Promise<void> {
  await captureDashboardProductEvent({
    event: 'agent_plan_generated',
    organizationId: args.organizationId,
    source: 'dashboard',
    channel: args.channel,
    planSource: args.cacheHit ? 'cached' : 'generated',
    stepCount: args.stepCount,
    generationMs: Math.max(0, Math.floor(args.generationMs)),
    cacheHit: args.cacheHit,
    insertId: productEventInsertId.agentPlanGenerated(args.planId),
  });
}

export function captureAgentActionsCompleted(actions: PersistedAgentAction[]): void {
  for (const action of actions) {
    if (
      !(TOOL_NAMES as readonly string[]).includes(action.tool)
      || !(TOOL_CATEGORIES as readonly string[]).includes(action.category)
    ) {
      continue;
    }

    void captureDashboardProductEvent({
      event: 'agent_action_completed',
      organizationId: action.organizationId,
      source: 'dashboard',
      toolName: action.tool as ToolName,
      toolCategory: action.category as ToolCategory,
      outcome: agentActionOutcome(action.status),
      insertId: productEventInsertId.agentActionCompleted(action.id),
    });
  }
}

export async function captureAgentPlanDecided(args: {
  changed: boolean;
  channel: MessageChannel;
  decision: PlanDecision;
  organizationId: string;
  planId: string;
}): Promise<void> {
  await captureDashboardProductEvent({
    event: 'agent_plan_decided',
    organizationId: args.organizationId,
    source: 'dashboard',
    decision: args.decision,
    channel: args.channel,
    changed: args.changed,
    insertId: productEventInsertId.agentPlanDecided(args.planId),
  });
}

export async function captureDashboardOutboundReplySent(args: {
  channel: string;
  messageId: string;
  organizationId: string;
  replySource: ReplySource;
}): Promise<void> {
  try {
    const channel = toProductMessageChannel(args.channel);
    if (!channel) return;

    await captureDashboardProductEvent({
      event: 'outbound_reply_sent',
      organizationId: args.organizationId,
      source: 'dashboard',
      channel,
      replySource: args.replySource,
      insertId: productEventInsertId.outboundReplySent(args.messageId),
    });

    if (args.replySource !== 'manual') {
      await captureDashboardWorkspaceActivation(args.organizationId);
    }
  } catch (error) {
    logger.warn(
      {
        errorClass: error instanceof Error ? error.name : 'UnknownError',
        organizationId: args.organizationId,
      },
      '[ProductAnalytics] Dashboard outbound context resolution failed',
    );
  }
}

async function captureDashboardWorkspaceActivation(
  organizationId: string,
): Promise<void> {
  const snapshot = await loadWorkspaceActivationSnapshot(organizationId);
  if (!snapshot) return;

  const secondsSinceWorkspaceCreated = Math.max(
    0,
    Math.floor((Date.now() - snapshot.organizationCreatedAt.getTime()) / 1_000),
  );
  await captureDashboardProductEvent({
    event: 'workspace_activated',
    organizationId,
    source: 'dashboard',
    secondsSinceWorkspaceCreated,
    withinSevenDays: secondsSinceWorkspaceCreated <= WORKSPACE_ACTIVATION_WINDOW_SECONDS,
    insertId: productEventInsertId.workspaceActivated(organizationId),
  });
}
