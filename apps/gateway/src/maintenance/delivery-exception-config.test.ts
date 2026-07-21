import { describe, expect, it, vi } from 'vitest';
import { isOrgDeliveryExceptionWatchEnabled } from './delivery-exception-config.js';

describe('isOrgDeliveryExceptionWatchEnabled', () => {
  it('is disabled when the global flag is off', () => {
    vi.stubEnv('DELIVERY_EXCEPTION_MONITOR_ENABLED', 'false');
    expect(isOrgDeliveryExceptionWatchEnabled({ deliveryExceptionWatchEnabled: true })).toBe(false);
    vi.unstubAllEnvs();
  });

  it('defaults to enabled for orgs when the global flag is on', () => {
    vi.stubEnv('DELIVERY_EXCEPTION_MONITOR_ENABLED', '1');
    expect(isOrgDeliveryExceptionWatchEnabled({})).toBe(true);
    vi.unstubAllEnvs();
  });

  it('respects an explicit org opt-out', () => {
    vi.stubEnv('DELIVERY_EXCEPTION_MONITOR_ENABLED', '1');
    expect(isOrgDeliveryExceptionWatchEnabled({ deliveryExceptionWatchEnabled: false })).toBe(false);
    vi.unstubAllEnvs();
  });
});
