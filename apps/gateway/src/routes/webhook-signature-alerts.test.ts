import { describe, expect, it, vi } from 'vitest';
import type { GatewayOpsAlertConfig } from '../runtime-config.js';
import {
  emitOpsAlert,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
  type OpsAlertLogger,
  type OpsAlertSentryClient,
} from '../ops-alerts.js';
import {
  recordWebhookSignatureFailure,
  type WebhookSignatureAlertDependencies,
} from './webhooks.js';

const CONFIG: GatewayOpsAlertConfig = {
  enabled: true,
  windowSecs: 300,
  queueFailedThreshold: 10,
  queueWaitingThreshold: 100,
  queueActiveStuckMs: 900_000,
  webhookSignatureThreshold: 5,
  providerSendThreshold: 3,
  agentFailureThreshold: 3,
};

const DISABLED_CONFIG: GatewayOpsAlertConfig = {
  ...CONFIG,
  enabled: false,
};

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
  return vi.fn<NonNullable<WebhookSignatureAlertDependencies['emitAlert']>>(() => LOG_ONLY_RESULT);
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<WebhookSignatureAlertDependencies> = {},
): WebhookSignatureAlertDependencies {
  return { counterClient: client, config: CONFIG, nowMs: 301_000, ...overrides };
}

describe('recordWebhookSignatureFailure', () => {
  describe('Meta — missing signature', () => {
    it('does not emit an alert below the threshold', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i < CONFIG.webhookSignatureThreshold; i++) {
        const result = await recordWebhookSignatureFailure('meta', 'missing_signature', makeDeps(client, { emitAlert }));
        expect(result.emitted).toBe(false);
      }

      expect(emitAlert).not.toHaveBeenCalled();
    });

    it('emits an alert exactly at the threshold', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure('meta', 'missing_signature', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      const alertInput = emitAlert.mock.calls[0]?.[0];
      expect(alertInput).toMatchObject({
        category: 'webhook_signature',
        level: 'warning',
        tags: { provider: 'meta', reason: 'missing_signature' },
        extra: { count: CONFIG.webhookSignatureThreshold, threshold: CONFIG.webhookSignatureThreshold },
      });
    });

    it('does not emit again after the threshold is crossed in the same window', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();
      const deps = makeDeps(client, { emitAlert });

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold + 2; i++) {
        await recordWebhookSignatureFailure('meta', 'missing_signature', deps);
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Meta — signature mismatch', () => {
    it('emits an alert at the threshold for signature_mismatch', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure('meta', 'signature_mismatch', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      const alertInput = emitAlert.mock.calls[0]?.[0];
      expect(alertInput).toMatchObject({
        category: 'webhook_signature',
        tags: { provider: 'meta', reason: 'signature_mismatch' },
      });
    });
  });

  describe('Shopify', () => {
    it('emits an alert at the threshold for missing_signature', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure('shopify', 'missing_signature', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
        category: 'webhook_signature',
        tags: { provider: 'shopify', reason: 'missing_signature' },
      });
    });

    it('emits an alert at the threshold for signature_mismatch', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure('shopify', 'signature_mismatch', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
        category: 'webhook_signature',
        tags: { provider: 'shopify', reason: 'signature_mismatch' },
      });
    });
  });

  describe('Twilio', () => {
    it('emits an alert at the threshold for missing_signature', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure('twilio', 'missing_signature', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
        category: 'webhook_signature',
        tags: { provider: 'twilio', reason: 'missing_signature' },
      });
    });

    it('emits an alert at the threshold for validation_failed', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure('twilio', 'validation_failed', makeDeps(client, { emitAlert }));
      }

      expect(emitAlert).toHaveBeenCalledTimes(1);
      expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
        category: 'webhook_signature',
        tags: { provider: 'twilio', reason: 'validation_failed' },
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
      const mockLogger: OpsAlertLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

      const realEmitDisabled: typeof emitOpsAlert = (input) =>
        emitOpsAlert(input, {
          config: DISABLED_CONFIG,
          env: { SENTRY_DSN: 'https://example.invalid/1' } as NodeJS.ProcessEnv,
          logger: mockLogger,
          sentry: mockSentry,
        });

      for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
        await recordWebhookSignatureFailure(
          'meta',
          'signature_mismatch',
          makeDeps(client, { config: DISABLED_CONFIG, emitAlert: realEmitDisabled }),
        );
      }

      expect(sentryCalls).toHaveLength(0);
      expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('counter isolation between providers', () => {
    it('meta and shopify with the same reason use different counters', async () => {
      const { client } = createCounterClient();
      const emitAlert = createEmitAlert();
      const threshold = CONFIG.webhookSignatureThreshold;

      // Fill meta counter to threshold - 1
      for (let i = 1; i < threshold; i++) {
        await recordWebhookSignatureFailure('meta', 'signature_mismatch', makeDeps(client, { emitAlert }));
      }
      expect(emitAlert).not.toHaveBeenCalled();

      // Fill shopify counter to threshold - 1 (separate counter; no cross-contamination)
      for (let i = 1; i < threshold; i++) {
        await recordWebhookSignatureFailure('shopify', 'signature_mismatch', makeDeps(client, { emitAlert }));
      }
      expect(emitAlert).not.toHaveBeenCalled();

      // Cross meta threshold
      await recordWebhookSignatureFailure('meta', 'signature_mismatch', makeDeps(client, { emitAlert }));
      expect(emitAlert).toHaveBeenCalledTimes(1);
      expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({ tags: { provider: 'meta' } });

      // Cross shopify threshold
      await recordWebhookSignatureFailure('shopify', 'signature_mismatch', makeDeps(client, { emitAlert }));
      expect(emitAlert).toHaveBeenCalledTimes(2);
      expect(emitAlert.mock.calls[1]?.[0]).toMatchObject({ tags: { provider: 'shopify' } });
    });
  });
});
