import type {
  AnalyticsInsertId,
  OnboardingStep,
} from './events.js';

function segment(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError(`${name} must be a non-empty identifier`);
  }
  return encodeURIComponent(trimmed);
}

function create(event: string, ...parts: string[]): AnalyticsInsertId {
  return [event, ...parts].join(':') as AnalyticsInsertId;
}

export const productEventInsertId = {
  workspaceCreated: (organizationId: string) =>
    create('workspace_created', segment(organizationId, 'organizationId')),
  onboardingStepCompleted: (organizationId: string, step: OnboardingStep) =>
    create(
      'onboarding_step_completed',
      segment(organizationId, 'organizationId'),
      segment(step, 'step'),
    ),
  onboardingCompleted: (organizationId: string) =>
    create('onboarding_completed', segment(organizationId, 'organizationId')),
  integrationConnectionCompleted: (integrationId: string) =>
    create(
      'integration_connection_completed',
      segment(integrationId, 'integrationId'),
    ),
  integrationConnectionFailed: (attemptId: string) =>
    create('integration_connection_failed', segment(attemptId, 'attemptId')),
  inboundMessageProcessed: (messageId: string) =>
    create('inbound_message_processed', segment(messageId, 'messageId')),
  agentPlanGenerated: (planId: string) =>
    create('agent_plan_generated', segment(planId, 'planId')),
  agentPlanDecided: (planId: string) =>
    create('agent_plan_decided', segment(planId, 'planId')),
  agentActionCompleted: (agentActionId: string) =>
    create('agent_action_completed', segment(agentActionId, 'agentActionId')),
  outboundReplySent: (messageId: string) =>
    create('outbound_reply_sent', segment(messageId, 'messageId')),
  subscriptionStatusChanged: (stripeEventId: string) =>
    create(
      'subscription_status_changed',
      segment(stripeEventId, 'stripeEventId'),
    ),
  workspaceActivated: (organizationId: string) =>
    create('workspace_activated', segment(organizationId, 'organizationId')),
} as const;
