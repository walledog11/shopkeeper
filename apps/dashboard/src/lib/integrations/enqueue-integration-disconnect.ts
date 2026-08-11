import logger from '@/lib/server/logger';
import { getGatewayBaseUrl } from '@/lib/server/gateway-url';
import {
  fetchProviderWithDeadline,
  isProviderRequestTimeoutError,
} from '@/lib/server/provider-fetch';

export type EnqueueIntegrationDisconnectResult = 'enqueued' | 'failed' | 'unknown';

export async function enqueueIntegrationDisconnect(input: {
  operationId: string;
  organizationId: string;
}): Promise<EnqueueIntegrationDisconnectResult> {
  let base: string | null;
  try {
    base = getGatewayBaseUrl();
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
        operationId: input.operationId,
      },
      '[IntegrationDisconnect] Queue admission configuration is invalid',
    );
    return 'failed';
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!base || !secret) {
    logger.error(
      { operationId: input.operationId, gatewayConfigured: Boolean(base) },
      '[IntegrationDisconnect] Queue admission is not configured',
    );
    return 'failed';
  }

  try {
    const response = await fetchProviderWithDeadline(
      `${base}/internal/queue/integration-disconnect`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify(input),
      },
      { provider: 'gateway', operation: 'integration-disconnect queue admission' },
    );
    if (!response.ok) {
      logger.error(
        {
          operationId: input.operationId,
          status: response.status,
          body: (await response.text().catch(() => '')).slice(0, 300),
        },
        '[IntegrationDisconnect] Gateway enqueue failed',
      );
      return 'failed';
    }
    return 'enqueued';
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
        operationId: input.operationId,
        timedOut: isProviderRequestTimeoutError(error),
      },
      '[IntegrationDisconnect] Gateway enqueue outcome unknown',
    );
    return 'unknown';
  }
}
