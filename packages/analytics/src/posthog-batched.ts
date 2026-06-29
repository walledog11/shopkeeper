import { PostHog } from 'posthog-node';
import type { ProductAnalyticsConfig } from './config.js';
import type { AnalyticsPayload, AnalyticsSink } from './sink.js';
import { requireEnabledPostHogConfig } from './sink.js';

interface BatchedPostHogClient {
  capture(payload: AnalyticsPayload): void;
  shutdown(): Promise<void>;
}

export class BatchedPostHogSink implements AnalyticsSink {
  private readonly client: BatchedPostHogClient;

  constructor(config: ProductAnalyticsConfig, client?: BatchedPostHogClient) {
    const enabledConfig = requireEnabledPostHogConfig(config);
    this.client = client ?? new PostHog(enabledConfig.projectToken, {
      host: enabledConfig.host,
      disableGeoip: true,
      flushAt: 20,
      flushInterval: 10_000,
    });
  }

  async capture(payload: AnalyticsPayload): Promise<void> {
    this.client.capture(payload);
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
