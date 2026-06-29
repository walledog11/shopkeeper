import type { AnalyticsEnvironment, ProductAnalyticsConfig } from './config.js';
import type {
  EventSource,
  ProductEventName,
  ProductEventProperties,
} from './events.js';

export interface AnalyticsPayload {
  event: ProductEventName;
  distinctId: string;
  properties: ProductEventProperties & {
    organization_id: string;
    schema_version: 1;
    environment: AnalyticsEnvironment;
    source: EventSource;
    '$process_person_profile': false;
    '$insert_id'?: string;
  };
}

export interface AnalyticsSink {
  capture(payload: AnalyticsPayload): Promise<void>;
  shutdown?(): Promise<void>;
}

export class NoopAnalyticsSink implements AnalyticsSink {
  async capture(payload: AnalyticsPayload): Promise<void> {
    void payload;
  }
}

export class RecordingAnalyticsSink implements AnalyticsSink {
  readonly events: AnalyticsPayload[] = [];

  async capture(payload: AnalyticsPayload): Promise<void> {
    this.events.push(structuredClone(payload));
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function requireEnabledPostHogConfig(
  config: ProductAnalyticsConfig,
): Required<Pick<ProductAnalyticsConfig, 'projectToken' | 'host'>> {
  if (!config.enabled || !config.projectToken) {
    throw new Error('Cannot create a PostHog sink while product analytics is disabled');
  }
  return { projectToken: config.projectToken, host: config.host };
}
