import { getGatewayDashboardUrl } from '../config/env.js';
import { getInternalApiSecret } from '../message-handlers/shared.js';

interface DashboardApiSuccess<T> {
  ok: true;
  data: T;
}

interface DashboardApiFailure {
  ok: false;
  status: number;
  responseBody: string;
}

export type DashboardApiResult<T> = DashboardApiSuccess<T> | DashboardApiFailure;

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
): Promise<DashboardApiResult<T>> {
  const response = await fetch(`${getGatewayDashboardUrl()}${path}`, {
    method: 'POST',
    headers: buildDashboardInternalHeaders(),
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
