import { describe, expect, it, vi } from 'vitest';
import {
  createOpsAlertCounterClient as createCounterClient,
  createOpsAlertRecordingLogger as createTestLogger,
} from '@shopkeeper/agent/testing';
import type { DashboardOpsAlertConfig } from '@/lib/env';
import {
  emitOpsAlert,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
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
  reason: 'logged',
};

type ProviderCase = {
  provider: Parameters<typeof recordProviderSendFailure>[0];
  channel: Parameters<typeof recordProviderSendFailure>[1];
  orgId: string;
  metadata?: Partial<ProviderSendAlertDependencies>;
};

const PROVIDER_CASES: ProviderCase[] = [
  { provider: 'meta', channel: 'ig_dm', orgId: 'org_meta' },
  {
    provider: 'postmark',
    channel: 'email',
    orgId: 'org_postmark',
    metadata: {
      threadId: 'thread_123',
      integrationId: 'integration_123',
      detail: 'Postmark timeout',
    },
  },
  { provider: 'shopify', channel: 'webhook_registration', orgId: 'org_shopify' },
];

describe('recordProviderSendFailure', () => {
  it('does not emit below the threshold and emits once at the threshold', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const firstCase = PROVIDER_CASES[0];

    for (let i = 1; i < CONFIG.providerSendThreshold; i++) {
      const result = await recordProviderSendFailure(
        firstCase.provider,
        firstCase.channel,
        firstCase.orgId,
        makeDeps(client, { emitAlert }),
      );
      expect(result.emitted).toBe(false);
    }

    expect(emitAlert).not.toHaveBeenCalled();

    await recordProviderSendFailure(
      firstCase.provider,
      firstCase.channel,
      firstCase.orgId,
      makeDeps(client, { emitAlert }),
    );

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'provider_send',
      level: 'error',
      tags: { provider: firstCase.provider, channel: firstCase.channel },
      extra: {
        orgId: firstCase.orgId,
        count: CONFIG.providerSendThreshold,
        threshold: CONFIG.providerSendThreshold,
      },
    });
  });

  it.each(PROVIDER_CASES)('emits provider metadata for $provider / $channel', async (testCase) => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure(
        testCase.provider,
        testCase.channel,
        testCase.orgId,
        makeDeps(client, { emitAlert, ...testCase.metadata }),
      );
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'provider_send',
      level: 'error',
      tags: { provider: testCase.provider, channel: testCase.channel },
      extra: {
        orgId: testCase.orgId,
        ...(testCase.metadata ?? {}),
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

  it('does not log alerts when alerts are disabled', async () => {
    const { client } = createCounterClient();
    const { logger, calls } = createTestLogger();

    const realEmitDisabled: typeof emitOpsAlert = (input) =>
      emitOpsAlert(input, { config: DISABLED_CONFIG, logger });

    for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure(
        'meta',
        'ig_dm',
        'org_abc',
        makeDeps(client, { config: DISABLED_CONFIG, emitAlert: realEmitDisabled }),
      );
    }

    expect(calls).toEqual([]);
  });

  // The test above injects DISABLED_CONFIG twice — once into the recorder and
  // again into its own emit shim — so it passed even while the recorder dropped
  // the config on the floor. Injecting it only once is what actually proves the
  // recorder forwards it: without that, emitOpsAlert falls back to
  // getDashboardOpsAlertConfig() and the caller's config never reaches the gate.
  it('forwards an injected config to the emit gate', async () => {
    const { client } = createCounterClient();
    const { logger, calls } = createTestLogger();

    const emitWithTestLogger: typeof emitOpsAlert = (input, dependencies) =>
      emitOpsAlert(input, { ...dependencies, logger });

    for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure(
        'meta',
        'ig_dm',
        'org_abc',
        makeDeps(client, { config: DISABLED_CONFIG, emitAlert: emitWithTestLogger }),
      );
    }

    expect(calls).toEqual([]);
  });

  it('re-alerts in a new window after the previous window expires', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (const nowMs of [301_000, 601_000]) {
      for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
        await recordProviderSendFailure('meta', 'ig_dm', 'org_abc', makeDeps(client, { emitAlert, nowMs }));
      }
    }

    expect(emitAlert).toHaveBeenCalledTimes(2);
  });

  it('counts separately per orgId', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure('meta', 'ig_dm', 'org_a', makeDeps(client, { emitAlert }));
      await recordProviderSendFailure('meta', 'ig_dm', 'org_b', makeDeps(client, { emitAlert }));
    }

    expect(emitAlert).not.toHaveBeenCalled();
  });
});

function createEmitAlert() {
  return vi.fn<NonNullable<ProviderSendAlertDependencies['emitAlert']>>(() => LOG_ONLY_RESULT);
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<ProviderSendAlertDependencies> = {},
): ProviderSendAlertDependencies {
  return { counterClient: client, config: CONFIG, nowMs: 301_000, ...overrides };
}
