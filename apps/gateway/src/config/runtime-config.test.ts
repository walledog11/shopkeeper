import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGatewayRuntimeRole,
  getGatewayOpsAlertConfig,
  getGatewayWorkerRedisConfig,
} from './runtime-config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getGatewayRuntimeRole', () => {
  it('throws on invalid roles so startup fails fast', () => {
    vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'queue');

    expect(() => getGatewayRuntimeRole()).toThrow(/GATEWAY_RUNTIME_ROLE/);
  });
});

describe('getGatewayWorkerRedisConfig', () => {
  it('accepts one and rejects zero, fractional, suffixed, and unsafe integers', () => {
    vi.stubEnv('GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS', '1');
    expect(getGatewayWorkerRedisConfig().drainDelaySeconds).toBe(1);

    for (const invalid of ['0', '1.5', '12ms', '9007199254740992']) {
      vi.stubEnv('GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS', invalid);
      expect(() => getGatewayWorkerRedisConfig()).toThrow(/must be a positive/);
    }
  });
});

describe('getGatewayOpsAlertConfig', () => {
  it('rejects invalid alert env values', () => {
    vi.stubEnv('OPS_ALERTS_ENABLED', 'maybe');
    expect(() => getGatewayOpsAlertConfig()).toThrow(/OPS_ALERTS_ENABLED/);

    vi.stubEnv('OPS_ALERTS_ENABLED', 'true');
    vi.stubEnv('OPS_ALERT_WINDOW_SECS', '0');
    expect(() => getGatewayOpsAlertConfig()).toThrow(/OPS_ALERT_WINDOW_SECS/);
  });
});
