import { getGatewayDashboardUrl } from '../config/env.js';
import { getInternalApiSecret } from './shared.js';

interface DashboardApiSuccess<T> {
  ok: true;
  data: T;
}

interface DashboardApiFailure {
  ok: false;
  status: number;
  responseBody: string;
}

type DashboardApiResult<T> = DashboardApiSuccess<T> | DashboardApiFailure;

interface AutoAckResponse {
  ok: boolean;
  skipped?: boolean;
}

async function postDashboardInternal<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<DashboardApiResult<T>> {
  const response = await fetch(`${getGatewayDashboardUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': getInternalApiSecret(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      responseBody: await response.text().catch(() => ''),
    };
  }

  return { ok: true, data: await response.json() as T };
}

export function requestAutoAck(threadId: string): Promise<DashboardApiResult<AutoAckResponse>> {
  return postDashboardInternal('/api/messages/auto-ack', { threadId });
}
