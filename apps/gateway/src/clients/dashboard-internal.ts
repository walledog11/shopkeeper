import { randomUUID } from 'node:crypto';
import { INTERNAL_REQUEST_ID_HEADER } from '@shopkeeper/agent/message-dispatch';
import { getGatewayDashboardUrl, getInternalApiSecret } from '../config/env.js';
import { fetchWithDeadline } from './request-deadline.js';

interface DashboardApiSuccess<T> {
  ok: true;
  data: T;
}

interface DashboardApiFailure {
  ok: false;
  status: number;
  responseBody: string;
  outcome: 'failed';
}

interface DashboardApiUnknown {
  ok: false;
  status: null;
  responseBody: string;
  outcome: 'unknown';
}

export type DashboardApiResult<T> =
  | DashboardApiSuccess<T>
  | DashboardApiFailure
  | DashboardApiUnknown;

export function buildDashboardInternalHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-internal-secret': getInternalApiSecret(),
    ...extra,
  };

  const bypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
  }

  return headers;
}

export async function postDashboardInternal<T>(
  path: string,
  body: Record<string, unknown>,
  options: { requestId?: string } = {},
): Promise<DashboardApiResult<T>> {
  const requestId = options.requestId ?? randomUUID();
  // Configuration failures are definite local failures, not ambiguous network
  // outcomes. Resolve them before entering the request-only catch below.
  const url = `${getGatewayDashboardUrl()}${path}`;
  const headers = buildDashboardInternalHeaders({
    [INTERNAL_REQUEST_ID_HEADER]: requestId,
  });
  let response: Response;
  try {
    response = await fetchWithDeadline(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, {
      provider: 'dashboard',
      operation: `internal POST ${path}`,
    });
  } catch (error) {
    return {
      ok: false,
      status: null,
      responseBody: error instanceof Error ? error.message : String(error),
      outcome: 'unknown',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      responseBody: await response.text().catch(() => ''),
      outcome: 'failed',
    };
  }

  return { ok: true, data: await response.json() as T };
}
