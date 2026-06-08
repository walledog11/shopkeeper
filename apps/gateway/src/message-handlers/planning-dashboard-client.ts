import { postDashboardInternal, type DashboardApiResult } from '../clients/dashboard-internal.js';

interface AutoAckResponse {
  ok: boolean;
  skipped?: boolean;
}

export function requestAutoAck(threadId: string): Promise<DashboardApiResult<AutoAckResponse>> {
  return postDashboardInternal('/api/messages/auto-ack', { threadId });
}
