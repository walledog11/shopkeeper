import type { ErrorEvent } from '@sentry/nextjs';
import { scrubSentryEvent, type SentryScrubEvent } from '@shopkeeper/agent/observability';

export function sentryBeforeSend(event: ErrorEvent): ErrorEvent | null {
  return scrubSentryEvent(event as SentryScrubEvent) as ErrorEvent;
}
