import { postDashboardInternal, type DashboardApiResult } from '../../clients/dashboard-internal.js';

interface AutoAckResponse {
  ok: boolean;
  skipped?: boolean;
}

/** `after_hours` sends the merchant's configured message; `handoff` tells a
 * messaging-channel customer that a person is looking at their message. */
export type AutoAckKind = 'after_hours' | 'handoff';

export function requestAutoAck(threadId: string, kind: AutoAckKind): Promise<DashboardApiResult<AutoAckResponse>> {
  return postDashboardInternal('/api/messages/auto-ack', { threadId, kind });
}
