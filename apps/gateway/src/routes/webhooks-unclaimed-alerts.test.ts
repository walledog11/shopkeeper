import { describe, expect, it, vi } from 'vitest';
import type { GatewayOpsAlertConfig } from '../config/runtime-config.js';
import {
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
} from '../ops-alerts.js';
import {
  recordUnclaimedInbound,
  type UnclaimedInboundAlertDependencies,
  type UnclaimedInboundReason,
} from './webhooks-unclaimed-alerts.js';

const CONFIG: GatewayOpsAlertConfig = {
  enabled: true,
  windowSecs: 300,
  queueFailedThreshold: 10,
  queueWaitingThreshold: 100,
  queueActiveStuckMs: 900_000,
  webhookSignatureThreshold: 5,
  providerSendThreshold: 3,
  agentFailureThreshold: 3,
  unclaimedRecipientThreshold: 5,
};

const LOG_ONLY_RESULT: EmitOpsAlertResult = { logged: true, reason: 'logged' };

const REASONS: UnclaimedInboundReason[] = [
  'missing_recipient',
  'malformed_local_part',
  'no_integration',
];

describe('recordUnclaimedInbound', () => {
  it('stays quiet below the threshold and alerts once at it', async () => {
    const client = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.unclaimedRecipientThreshold; i++) {
      const result = await recordUnclaimedInbound('no_integration', makeDeps(client, { emitAlert }));
      expect(result.emitted).toBe(false);
    }
    expect(emitAlert).not.toHaveBeenCalled();

    const crossing = await recordUnclaimedInbound('no_integration', makeDeps(client, { emitAlert }));

    expect(crossing.emitted).toBe(true);
    expect(emitAlert).toHaveBeenCalledOnce();
  });

  it('alerts only on the crossing, not on every later failure', async () => {
    const client = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 0; i < CONFIG.unclaimedRecipientThreshold + 4; i++) {
      await recordUnclaimedInbound('no_integration', makeDeps(client, { emitAlert }));
    }

    expect(emitAlert).toHaveBeenCalledOnce();
  });

  it('counts each reason separately so one misconfiguration cannot mask another', async () => {
    const client = createCounterClient();
    const emitAlert = createEmitAlert();

    // Four of each — one short of the threshold on every reason. A shared
    // counter would have crossed at twelve and named the wrong cause.
    for (const reason of REASONS) {
      for (let i = 0; i < CONFIG.unclaimedRecipientThreshold - 1; i++) {
        await recordUnclaimedInbound(reason, makeDeps(client, { emitAlert }));
      }
    }

    expect(emitAlert).not.toHaveBeenCalled();
  });

  it('names the reason and the recipient domain, which is what gets acted on', async () => {
    const client = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 0; i < CONFIG.unclaimedRecipientThreshold; i++) {
      await recordUnclaimedInbound(
        'malformed_local_part',
        makeDeps(client, { emitAlert, recipientDomain: 'inbound.shopkeeper.delivery' }),
      );
    }

    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'inbound_unclaimed',
      level: 'warning',
      tags: { reason: 'malformed_local_part', recipientDomain: 'inbound.shopkeeper.delivery' },
      extra: { route: '/webhooks/email/inbound', threshold: 5 },
      fingerprint: ['ops-alert', 'inbound_unclaimed', 'gateway', 'reason:malformed_local_part'],
    });
  });

  it('falls back to a placeholder domain rather than dropping the alert', async () => {
    const client = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 0; i < CONFIG.unclaimedRecipientThreshold; i++) {
      await recordUnclaimedInbound('missing_recipient', makeDeps(client, { emitAlert, recipientDomain: '  ' }));
    }

    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      tags: { recipientDomain: 'unknown' },
    });
  });
});

function createCounterClient(): OpsAlertCounterClient {
  const counts = new Map<string, number>();
  return {
    incr: async (key) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    expire: async () => undefined,
  };
}

function createEmitAlert() {
  return vi.fn<NonNullable<UnclaimedInboundAlertDependencies['emitAlert']>>(() => LOG_ONLY_RESULT);
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<UnclaimedInboundAlertDependencies> = {},
): UnclaimedInboundAlertDependencies {
  return { counterClient: client, config: CONFIG, nowMs: 301_000, ...overrides };
}
