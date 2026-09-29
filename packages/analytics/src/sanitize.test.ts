import { describe, expect, it } from 'vitest';
import { getEventProperties, sanitizeProductEvent } from './sanitize.js';

const BASE = {
  organizationId: '9d1a7a51-2c0b-4d24-989f-e86362c01446',
  source: 'gateway',
} as const;

describe('sanitizeProductEvent', () => {
  it('drops unknown and prohibited properties', () => {
    const event = sanitizeProductEvent({
      ...BASE,
      event: 'integration_connection_completed',
      platform: 'shopify',
      email: 'merchant@example.com',
      accessToken: 'secret',
      properties: { message: 'customer content' },
    });

    expect(event).toEqual({
      ...BASE,
      event: 'integration_connection_completed',
      platform: 'shopify',
    });
  });

  it.each([
    [null, 'must be an object'],
    [[], 'must be an object'],
    [{ ...BASE }, 'event'],
    [{ event: 'workspace_created', ...BASE, organizationId: 'org_clerk' }, 'organizationId'],
    [{ event: 'workspace_created', ...BASE, source: 'browser' }, 'source'],
    [{ event: 'onboarding_step_completed', ...BASE, step: 'unknown' }, 'step'],
    [{ event: 'integration_connection_started', ...BASE, platform: 'gmail' }, 'platform'],
    [
      {
        event: 'integration_connection_failed',
        ...BASE,
        platform: 'email',
        failureCategory: 'raw provider error',
      },
      'failureCategory',
    ],
    [
      {
        event: 'agent_plan_generated',
        ...BASE,
        channel: 'email',
        planSource: 'generated',
        stepCount: -1,
        generationMs: 1,
        cacheHit: false,
      },
      'stepCount',
    ],
    [{ event: 'unknown', ...BASE }, 'Unknown product analytics event'],
  ])('rejects invalid event contracts', (event, expected) => {
    expect(() => sanitizeProductEvent(event)).toThrow(expected);
  });

  it('rejects unsafe insert IDs', () => {
    expect(() =>
      sanitizeProductEvent({
        event: 'workspace_created',
        ...BASE,
        insertId: 'workspace_created:merchant@example.com',
      }),
    ).toThrow(/safe identifier characters/);
  });
});

describe('getEventProperties', () => {
  it('maps application field names to analytics snake_case', () => {
    expect(getEventProperties({
      ...BASE,
      event: 'agent_plan_generated',
      channel: 'email',
      planSource: 'generated',
      stepCount: 2,
      generationMs: 500,
      cacheHit: false,
    })).toEqual({
      channel: 'email',
      plan_source: 'generated',
      step_count: 2,
      generation_ms: 500,
      cache_hit: false,
    });
  });
});
