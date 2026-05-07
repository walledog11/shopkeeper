import { describe, expect, it, vi } from 'vitest';
import type { DashboardOpsAlertConfig } from '@/lib/env';
import {
  emitOpsAlert,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
  type OpsAlertSentryClient,
} from './ops-alerts';
import {
  recordProviderSendFailure,
  type ProviderSendAlertDependencies,
} from './provider-send-alerts';

const CONFIG: DashboardOpsAlertConfig = {
  enabled: true,
  windowSecs: 300,
  queueFailedThreshold: 10,
  queueWaitingThreshold: 100,
  queueActiveStuckMs: 900_000,
  webhookSignatureThreshold: 5,
  providerSendThreshold: 3,
  agentFailureThreshold: 3,
};

const DISABLED_CONFIG: DashboardOpsAlertConfig = { ...CONFIG, enabled: false };

const LOG_ONLY_RESULT: EmitOpsAlertResult = {
  logged: true,
  captured: false,
  eventId: null,
  reason: 'missing_dsn',
};

function createCounterClient(): { client: OpsAlertCounterClient } {
  const counts = new Map<string, number>();
  return {
    client: {
      incr: async (key) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      expire: async () => undefined,
    },
  };
}

function createEmitAlert() {
  return vi.fn<NonNullable<ProviderSendAlertDependencies['emitAlert']>>(() => LOG_ONLY_RESULT);
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<ProviderSendAlertDependencies> = {},
): ProviderSendAlertDependencies {
  return { counterClient: client, config: CONFIG, nowMs: 301_000, ...overrides };
}

describe('recordProviderSendFailure', () => {
  describe('Meta — ig_dm', () => {
    it('does not emit an alert below the threshold', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i < CONFIG.providerSendThreshold; i++) {
        const result = await recordProviderSendFailure('meta', 'ig_dm', 'org_abc', makeDeps(client, { emitAlert }));
        expect(result.emitted).toBe(false);
      }

      expect(emitAlert).not.toHaveBeenCalled();
    });

    it('emits an alert exactly at the threshold', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('meta', 'ig_dm', 'org_abc', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      const alertInput = emitAlert.mock.calls[0]?.[0];
      expect(alertInput).toMatchObject({
        category: 'provider_send',
        level: 'error',
        tags: { provider: 'meta', channel: 'ig_dm' },
        extra: {
          orgId: 'org_abc',
          count: CONFIG.providerSendThreshold,
          threshold: CONFIG.providerSendThreshold,
        },
      });
    });

    it('does not emit again after the threshold is crossed in the same window', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();
      const deps = makeDeps(client, { emitAlert });

      for (let i = 1; i <= CONFIG.providerSendThreshold + 2; i++) {
        await recordProviderSendFailure('meta', 'ig_dm', 'org_abc', deps);
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Postmark — email', () => {
    it('emits at threshold with correct provider/channel tags', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('postmark', 'email', 'org_xyz', makeDeps(client, {
          emitAlert,
          threadId: 'thread_123',
          integrationId: 'integration_123',
          detail: 'Postmark timeout',
        }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      const alertInput = emitAlert.mock.calls[0]?.[0];
      expect(alertInput).toMatchObject({
        category: 'provider_send',
        level: 'error',
        tags: { provider: 'postmark', channel: 'email' },
        extra: {
          orgId: 'org_xyz',
          threadId: 'thread_123',
          integrationId: 'integration_123',
          detail: 'Postmark timeout',
        },
      });
    });
  });

  describe('Twilio — sms', () => {
    it('emits at threshold with correct provider/channel tags', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('twilio', 'sms', 'org_xyz', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      const alertInput = emitAlert.mock.calls[0]?.[0];
      expect(alertInput).toMatchObject({
        category: 'provider_send',
        level: 'error',
        tags: { provider: 'twilio', channel: 'sms' },
        extra: { orgId: 'org_xyz' },
      });
    });
  });

  describe('Shopify — webhook_registration', () => {
    it('emits at threshold with correct provider/channel tags', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('shopify', 'webhook_registration', 'org_shop', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      const alertInput = emitAlert.mock.calls[0]?.[0];
      expect(alertInput).toMatchObject({
        category: 'provider_send',
        level: 'error',
        tags: { provider: 'shopify', channel: 'webhook_registration' },
        extra: { orgId: 'org_shop' },
      });
    });
  });

  describe('OPS_ALERTS_ENABLED=false', () => {
    it('does not capture to Sentry when alerts are disabled', async () => {
      const { client } = createCounterClient();
      const sentryCalls: string[] = [];
      const mockSentry: OpsAlertSentryClient = {
        captureMessage: vi.fn((msg: string) => { sentryCalls.push(msg); return 'event-id'; }),
        captureException: vi.fn(),
      };

      const realEmitDisabled: typeof emitOpsAlert = (input) =>
        emitOpsAlert(input, {
          config: DISABLED_CONFIG,
          env: { ...process.env, SENTRY_DSN: 'https://example.invalid/1' },
          sentry: mockSentry,
        });

      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure(
          'meta',
          'ig_dm',
          'org_abc',
          makeDeps(client, { config: DISABLED_CONFIG, emitAlert: realEmitDisabled }),
        );
      }

      expect(sentryCalls).toHaveLength(0);
      expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('window reset', () => {
    it('re-alerts in a new window after the previous window expires', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      // First window: nowMs=301_000 → windowStart=1
      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('meta', 'ig_dm', 'org_abc', makeDeps(client, { emitAlert, nowMs: 301_000 }));
      }
      expect(emitAlert).toHaveBeenCalledTimes(1);

      // Second window: nowMs=601_000 → windowStart=2 — new counter key
      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('meta', 'ig_dm', 'org_abc', makeDeps(client, { emitAlert, nowMs: 601_000 }));
      }
      expect(emitAlert).toHaveBeenCalledTimes(2);
    });
  });

  describe('counter isolation by org', () => {
    it('counts separately per orgId', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      // Each org gets 2 failures (below threshold of 3)
      for (let i = 1; i < CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('meta', 'ig_dm', 'org_a', makeDeps(client, { emitAlert }));
        await recordProviderSendFailure('meta', 'ig_dm', 'org_b', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).not.toHaveBeenCalled();
    });
  });
});
