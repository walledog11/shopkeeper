import { describe, expect, it } from 'vitest';
import { productEventInsertId } from './insert-id.js';

const ORGANIZATION_ID = '9d1a7a51-2c0b-4d24-989f-e86362c01446';

describe('productEventInsertId', () => {
  it('builds every deterministic event key from the documented identifiers', () => {
    expect(productEventInsertId.workspaceCreated(ORGANIZATION_ID)).toBe(
      `workspace_created:${ORGANIZATION_ID}`,
    );
    expect(productEventInsertId.onboardingStepCompleted(ORGANIZATION_ID, 'email')).toBe(
      `onboarding_step_completed:${ORGANIZATION_ID}:email`,
    );
    expect(productEventInsertId.onboardingCompleted(ORGANIZATION_ID)).toBe(
      `onboarding_completed:${ORGANIZATION_ID}`,
    );
    expect(productEventInsertId.integrationConnectionCompleted('integration-id')).toBe(
      'integration_connection_completed:integration-id',
    );
    expect(productEventInsertId.integrationConnectionFailed('oauth:attempt')).toBe(
      'integration_connection_failed:oauth%3Aattempt',
    );
    expect(productEventInsertId.inboundMessageProcessed('message-id')).toBe(
      'inbound_message_processed:message-id',
    );
    expect(productEventInsertId.agentPlanGenerated('plan-id')).toBe(
      'agent_plan_generated:plan-id',
    );
    expect(productEventInsertId.agentPlanDecided('plan-id')).toBe(
      'agent_plan_decided:plan-id',
    );
    expect(productEventInsertId.agentActionCompleted('action-id')).toBe(
      'agent_action_completed:action-id',
    );
    expect(productEventInsertId.outboundReplySent('message-id')).toBe(
      'outbound_reply_sent:message-id',
    );
    expect(productEventInsertId.subscriptionStatusChanged('evt_1')).toBe(
      'subscription_status_changed:evt_1',
    );
    expect(productEventInsertId.workspaceActivated(ORGANIZATION_ID)).toBe(
      `workspace_activated:${ORGANIZATION_ID}`,
    );
  });

  it('rejects empty identifier segments', () => {
    expect(() => productEventInsertId.workspaceCreated('  ')).toThrow(
      /non-empty identifier/,
    );
  });
});
