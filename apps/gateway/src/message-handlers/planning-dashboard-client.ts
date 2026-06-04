import { getGatewayDashboardUrl } from '../config/env.js';
import type { AgentPlan } from '../types.js';
import { getInternalApiSecret } from './shared.js';
import type { AgentActionResult } from './planning-types.js';

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

export interface PlanInternalResponse {
  plan: AgentPlan | null;
  instruction: string;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}

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

export function requestThreadPlan(
  organizationId: string,
  threadId: string,
  allowAutoExecute: boolean,
): Promise<DashboardApiResult<PlanInternalResponse>> {
  return postDashboardInternal('/api/agent/plan-internal', {
    orgId: organizationId,
    threadId,
    allowAutoExecute,
  });
}

export function requestAutoAck(threadId: string): Promise<DashboardApiResult<AutoAckResponse>> {
  return postDashboardInternal('/api/messages/auto-ack', { threadId });
}
