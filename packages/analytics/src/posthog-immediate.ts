import { PostHog } from 'posthog-node';
import type { ProductAnalyticsConfig } from './config.js';
import type { AnalyticsPayload, AnalyticsSink } from './sink.js';
import { requireEnabledPostHogConfig } from './sink.js';

interface ImmediatePostHogClient {
  captureImmediate(payload: AnalyticsPayload): Promise<unknown>;
  shutdown(): Promise<void>;
}

export class ImmediatePostHogSink implements AnalyticsSink {
  private readonly client: ImmediatePostHogClient;

  constructor(config: ProductAnalyticsConfig, client?: ImmediatePostHogClient) {
    const enabledConfig = requireEnabledPostHogConfig(config);
    this.client = client ?? new PostHog(enabledConfig.projectToken, {
      host: enabledConfig.host,
      disableGeoip: true,
    });
  }

  async capture(payload: AnalyticsPayload): Promise<void> {
    await this.client.captureImmediate(payload);
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
