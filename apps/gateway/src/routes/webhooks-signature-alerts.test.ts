import { describe, expect, it, vi } from 'vitest';
import type { GatewayOpsAlertConfig } from '../config/runtime-config.js';
import {
  emitOpsAlert,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
  type OpsAlertLogger,
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
  reason: 'logged',
};

type SignatureCase = {
  provider: Parameters<typeof recordWebhookSignatureFailure>[0];
  reason: Parameters<typeof recordWebhookSignatureFailure>[1];
};

const SIGNATURE_CASES: SignatureCase[] = [
  { provider: 'meta', reason: 'missing_signature' },
  { provider: 'meta', reason: 'signature_mismatch' },
  { provider: 'shopify', reason: 'missing_signature' },
  { provider: 'shopify', reason: 'signature_mismatch' },
  { provider: 'telegram', reason: 'missing_signature' },
  { provider: 'telegram', reason: 'signature_mismatch' },
  { provider: 'tiktok_shop', reason: 'missing_signature' },
  { provider: 'tiktok_shop', reason: 'signature_mismatch' },
];

describe('recordWebhookSignatureFailure', () => {
  it('does not emit below the threshold and emits once at the threshold', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const firstCase = SIGNATURE_CASES[0];

    for (let i = 1; i < CONFIG.webhookSignatureThreshold; i++) {
      const result = await recordWebhookSignatureFailure(
        firstCase.provider,
        firstCase.reason,
        makeDeps(client, { emitAlert }),
      );
      expect(result.emitted).toBe(false);
    }

    expect(emitAlert).not.toHaveBeenCalled();

    await recordWebhookSignatureFailure(
      firstCase.provider,
      firstCase.reason,
      makeDeps(client, { emitAlert }),
    );

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'webhook_signature',
      level: 'warning',
      tags: { provider: firstCase.provider, reason: firstCase.reason },
      extra: {
        count: CONFIG.webhookSignatureThreshold,
        threshold: CONFIG.webhookSignatureThreshold,
      },
    });
  });

  it.each(SIGNATURE_CASES)('emits provider/reason metadata for $provider / $reason', async (testCase) => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
      await recordWebhookSignatureFailure(
        testCase.provider,
        testCase.reason,
        makeDeps(client, { emitAlert }),
      );
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'webhook_signature',
      tags: { provider: testCase.provider, reason: testCase.reason },
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

  it('does not log alerts when alerts are disabled', async () => {
    const { client } = createCounterClient();
    const mockLogger: OpsAlertLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const realEmitDisabled: typeof emitOpsAlert = (input) =>
      emitOpsAlert(input, {
        config: DISABLED_CONFIG,
        logger: mockLogger,
      });

    for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
      await recordWebhookSignatureFailure(
        'meta',
        'signature_mismatch',
        makeDeps(client, { config: DISABLED_CONFIG, emitAlert: realEmitDisabled }),
      );
    }

    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('uses separate counters per provider and reason', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.webhookSignatureThreshold; i++) {
      await recordWebhookSignatureFailure('meta', 'signature_mismatch', makeDeps(client, { emitAlert }));
      await recordWebhookSignatureFailure('shopify', 'signature_mismatch', makeDeps(client, { emitAlert }));
    }
    expect(emitAlert).not.toHaveBeenCalled();

    await recordWebhookSignatureFailure('meta', 'signature_mismatch', makeDeps(client, { emitAlert }));
    await recordWebhookSignatureFailure('shopify', 'signature_mismatch', makeDeps(client, { emitAlert }));

    expect(emitAlert).toHaveBeenCalledTimes(2);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({ tags: { provider: 'meta' } });
    expect(emitAlert.mock.calls[1]?.[0]).toMatchObject({ tags: { provider: 'shopify' } });
  });

  it('attaches route and safe request metadata to threshold alerts', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const request = {
      method: 'POST',
      path: '/webhooks/meta',
      userAgent: 'Meta-Webhook-Test',
      contentType: 'application/json',
      requestId: 'req_123',
      ip: '127.0.0.1',
    };

    for (let i = 1; i <= CONFIG.webhookSignatureThreshold; i++) {
      await recordWebhookSignatureFailure('meta', 'signature_mismatch', makeDeps(client, {
        emitAlert,
        route: '/webhooks/meta',
        request,
      }));
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      tags: {
        provider: 'meta',
        reason: 'signature_mismatch',
        route: '/webhooks/meta',
      },
      extra: {
        route: '/webhooks/meta',
        request,
      },
      fingerprint: [
        'ops-alert',
        'webhook_signature',
        'gateway',
        'provider:meta',
        'reason:signature_mismatch',
      ],
    });
  });
});

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
