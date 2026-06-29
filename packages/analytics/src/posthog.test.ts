import { describe, expect, it, vi } from 'vitest';
import type { ProductAnalyticsConfig } from './config.js';
import { BatchedPostHogSink } from './posthog-batched.js';
import { ImmediatePostHogSink } from './posthog-immediate.js';
import type { AnalyticsPayload } from './sink.js';

const CONFIG: ProductAnalyticsConfig = {
  enabled: true,
  environment: 'test',
  projectToken: 'phc_test',
  host: 'https://us.i.posthog.com',
};

const PAYLOAD: AnalyticsPayload = {
  event: 'workspace_created',
  distinctId: '9d1a7a51-2c0b-4d24-989f-e86362c01446',
  properties: {
    organization_id: '9d1a7a51-2c0b-4d24-989f-e86362c01446',
    schema_version: 1,
    environment: 'test',
    source: 'dashboard',
    '$process_person_profile': false,
  },
};

describe('PostHog sinks', () => {
  it('uses immediate capture for short-lived server execution', async () => {
    const client = {
      captureImmediate: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
    };
    const sink = new ImmediatePostHogSink(CONFIG, client);

    await sink.capture(PAYLOAD);
    await sink.shutdown();

    expect(client.captureImmediate).toHaveBeenCalledWith(PAYLOAD);
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('uses batched capture and flushes on shutdown', async () => {
    const client = {
      capture: vi.fn(),
      shutdown: vi.fn(async () => {}),
    };
    const sink = new BatchedPostHogSink(CONFIG, client);

    await sink.capture(PAYLOAD);
    await sink.shutdown();

    expect(client.capture).toHaveBeenCalledWith(PAYLOAD);
    expect(client.shutdown).toHaveBeenCalledOnce();
  });
});
