import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGatewayBodyLimits } from './runtime-config.js';

const ENV_KEYS = [
  'GATEWAY_BODY_LIMIT_WEBHOOK_BYTES',
  'GATEWAY_BODY_LIMIT_EMAIL_BYTES',
  'GATEWAY_BODY_LIMIT_INTERNAL_BYTES',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('getGatewayBodyLimits', () => {
  it('keeps signed webhooks and internal routes far below the email budget', () => {
    const limits = getGatewayBodyLimits();

    expect(limits.webhookBytes).toBe(2_097_152);
    expect(limits.internalBytes).toBe(1_048_576);
    expect(limits.emailInboundBytes).toBe(52_428_800);
    expect(limits.webhookBytes).toBeLessThan(limits.emailInboundBytes);
    expect(limits.internalBytes).toBeLessThan(limits.emailInboundBytes);
  });

  it('applies per-tier environment overrides', () => {
    process.env.GATEWAY_BODY_LIMIT_WEBHOOK_BYTES = '4096';
    process.env.GATEWAY_BODY_LIMIT_EMAIL_BYTES = '8192';
    process.env.GATEWAY_BODY_LIMIT_INTERNAL_BYTES = '512';

    expect(getGatewayBodyLimits()).toEqual({
      webhookBytes: 4096,
      emailInboundBytes: 8192,
      internalBytes: 512,
    });
  });

  it('rejects a non-positive override rather than falling back silently', () => {
    process.env.GATEWAY_BODY_LIMIT_WEBHOOK_BYTES = '0';

    expect(() => getGatewayBodyLimits()).toThrow(
      '[Gateway] GATEWAY_BODY_LIMIT_WEBHOOK_BYTES must be a positive integer',
    );
  });
});
