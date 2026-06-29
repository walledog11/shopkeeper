import { describe, expect, it } from 'vitest';
import type { ProductAnalyticsConfig } from './config.js';
import {
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
  requireEnabledPostHogConfig,
} from './sink.js';

const PAYLOAD = {
  event: 'workspace_created',
  distinctId: '9d1a7a51-2c0b-4d24-989f-e86362c01446',
  properties: {
    organization_id: '9d1a7a51-2c0b-4d24-989f-e86362c01446',
    schema_version: 1,
    environment: 'test',
    source: 'dashboard',
    '$process_person_profile': false,
  },
} as const;

describe('RecordingAnalyticsSink', () => {
  it('records an isolated copy and can clear it', async () => {
    const sink = new RecordingAnalyticsSink();
    await sink.capture(PAYLOAD);

    expect(sink.events).toEqual([PAYLOAD]);
    expect(sink.events[0]).not.toBe(PAYLOAD);

    sink.clear();
    expect(sink.events).toEqual([]);
  });

  it('allows the no-op sink to be awaited', async () => {
    await expect(new NoopAnalyticsSink().capture(PAYLOAD)).resolves.toBeUndefined();
  });
});

describe('requireEnabledPostHogConfig', () => {
  it('returns only sink configuration when enabled', () => {
    const config: ProductAnalyticsConfig = {
      enabled: true,
      environment: 'production',
      projectToken: 'phc_test',
      host: 'https://us.i.posthog.com',
    };
    expect(requireEnabledPostHogConfig(config)).toEqual({
      projectToken: 'phc_test',
      host: 'https://us.i.posthog.com',
    });
  });

  it('rejects disabled configuration', () => {
    expect(() =>
      requireEnabledPostHogConfig({
        enabled: false,
        environment: 'development',
        host: 'https://us.i.posthog.com',
      }),
    ).toThrow(/disabled/);
  });
});
