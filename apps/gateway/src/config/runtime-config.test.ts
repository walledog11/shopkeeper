import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGatewayRuntimeRole,
  getGatewayOpsAlertConfig,
  getGatewayWorkerRedisConfig,
  isOrderRiskMonitorEnabled,
  shouldRunGatewayServer,
  shouldRunGatewayWorker,
} from './runtime-config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getGatewayRuntimeRole', () => {
  it('defaults to running both server and worker', () => {
    expect(getGatewayRuntimeRole()).toBe('all');
    expect(shouldRunGatewayServer()).toBe(true);
    expect(shouldRunGatewayWorker()).toBe(true);
  });

  it('supports running only the HTTP server', () => {
    vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'server');

    expect(getGatewayRuntimeRole()).toBe('server');
    expect(shouldRunGatewayServer()).toBe(true);
    expect(shouldRunGatewayWorker()).toBe(false);
  });

  it('supports running only the worker', () => {
    vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'worker');

    expect(getGatewayRuntimeRole()).toBe('worker');
    expect(shouldRunGatewayServer()).toBe(false);
    expect(shouldRunGatewayWorker()).toBe(true);
  });

  it('throws on invalid roles so startup fails fast', () => {
    vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'queue');

    expect(() => getGatewayRuntimeRole()).toThrow(/GATEWAY_RUNTIME_ROLE/);
  });
});

describe('getGatewayWorkerRedisConfig', () => {
  it('uses lower-chatter defaults in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(getGatewayWorkerRedisConfig()).toMatchObject({
      drainDelaySeconds: 60,
      stalledIntervalMs: 300_000,
      heartbeatIntervalMs: 300_000,
      queueDiagnosticsCacheMs: 30_000,
      maintenanceWorkersEnabled: true,
    });
  });

  it('respects explicit overrides', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS', '90');
    vi.stubEnv('GATEWAY_BULLMQ_STALLED_INTERVAL_MS', '600000');
    vi.stubEnv('GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS', '120000');
    vi.stubEnv('GATEWAY_WORKER_HEARTBEAT_TTL_SECS', '600');
    vi.stubEnv('GATEWAY_WORKER_HEARTBEAT_STALE_MS', '240000');
    vi.stubEnv('GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS', '45000');
    vi.stubEnv('GATEWAY_ENABLE_MAINTENANCE_WORKERS', 'false');

    expect(getGatewayWorkerRedisConfig()).toMatchObject({
      drainDelaySeconds: 90,
      stalledIntervalMs: 600_000,
      heartbeatIntervalMs: 120_000,
      heartbeatTtlSecs: 600,
      heartbeatStaleMs: 240_000,
      queueDiagnosticsCacheMs: 45_000,
      maintenanceWorkersEnabled: false,
    });
  });
});

describe('getGatewayOpsAlertConfig', () => {
  it('uses launch guardrail defaults', () => {
    expect(getGatewayOpsAlertConfig()).toEqual({
      enabled: true,
      windowSecs: 300,
      queueFailedThreshold: 10,
      queueWaitingThreshold: 100,
      queueActiveStuckMs: 900_000,
      webhookSignatureThreshold: 5,
      providerSendThreshold: 3,
      agentFailureThreshold: 3,
    });
  });

  it('respects explicit overrides', () => {
    vi.stubEnv('OPS_ALERTS_ENABLED', 'false');
    vi.stubEnv('OPS_ALERT_WINDOW_SECS', '120');
    vi.stubEnv('QUEUE_ALERT_FAILED_THRESHOLD', '7');
    vi.stubEnv('QUEUE_ALERT_WAITING_THRESHOLD', '70');
    vi.stubEnv('QUEUE_ALERT_ACTIVE_STUCK_MS', '600000');
    vi.stubEnv('WEBHOOK_SIGNATURE_ALERT_THRESHOLD', '9');
    vi.stubEnv('PROVIDER_SEND_ALERT_THRESHOLD', '4');
    vi.stubEnv('AGENT_FAILURE_ALERT_THRESHOLD', '6');

    expect(getGatewayOpsAlertConfig()).toEqual({
      enabled: false,
      windowSecs: 120,
      queueFailedThreshold: 7,
      queueWaitingThreshold: 70,
      queueActiveStuckMs: 600_000,
      webhookSignatureThreshold: 9,
      providerSendThreshold: 4,
      agentFailureThreshold: 6,
    });
  });

  it('rejects invalid alert env values', () => {
    vi.stubEnv('OPS_ALERTS_ENABLED', 'maybe');
    expect(() => getGatewayOpsAlertConfig()).toThrow(/OPS_ALERTS_ENABLED/);

    vi.stubEnv('OPS_ALERTS_ENABLED', 'true');
    vi.stubEnv('OPS_ALERT_WINDOW_SECS', '0');
    expect(() => getGatewayOpsAlertConfig()).toThrow(/OPS_ALERT_WINDOW_SECS/);
  });
});

describe('isOrderRiskMonitorEnabled', () => {
  it('defaults to disabled when unset', () => {
    expect(isOrderRiskMonitorEnabled()).toBe(false);
  });

  it('enables only for explicit truthy values', () => {
    vi.stubEnv('ORDER_RISK_MONITOR_ENABLED', '1');
    expect(isOrderRiskMonitorEnabled()).toBe(true);

    vi.stubEnv('ORDER_RISK_MONITOR_ENABLED', 'true');
    expect(isOrderRiskMonitorEnabled()).toBe(true);
  });

  it('treats falsey string values as disabled', () => {
    vi.stubEnv('ORDER_RISK_MONITOR_ENABLED', 'false');
    expect(isOrderRiskMonitorEnabled()).toBe(false);

    vi.stubEnv('ORDER_RISK_MONITOR_ENABLED', '0');
    expect(isOrderRiskMonitorEnabled()).toBe(false);
  });

  it('rejects invalid boolean strings', () => {
    vi.stubEnv('ORDER_RISK_MONITOR_ENABLED', 'maybe');
    expect(() => isOrderRiskMonitorEnabled()).toThrow(/ORDER_RISK_MONITOR_ENABLED/);
  });
});
