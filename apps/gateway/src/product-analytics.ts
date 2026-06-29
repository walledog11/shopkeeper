import {
  initializeProductAnalytics,
  shutdownProductAnalytics,
} from '@shopkeeper/analytics';
import logger from './logger.js';
import type { GatewayShutdownResource } from './workers/resources.js';

export function initializeGatewayProductAnalytics(): void {
  initializeProductAnalytics({ delivery: 'batched', logger });
}

export function createProductAnalyticsShutdownResource(
  shutdown: () => Promise<void> = shutdownProductAnalytics,
): GatewayShutdownResource {
  return {
    label: 'product-analytics',
    close: shutdown,
  };
}
