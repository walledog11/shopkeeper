import * as Sentry from '@sentry/nextjs';
import { initializeProductAnalytics } from '@shopkeeper/analytics';
import { validateDashboardEnv } from '@/lib/env';
import logger from '@/lib/server/logger';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    validateDashboardEnv();
    initializeProductAnalytics({ delivery: 'immediate', logger });

    const dns = await import('dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
