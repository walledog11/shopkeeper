import type { OpsAlertCaptureContext } from './ops-alerts.js';

/**
 * A run that reached its step limit or token budget and whose one closing
 * answer failed or came back empty, so the merchant got the fallback line
 * instead of an answer.
 */
export interface UnansweredLimitEvent {
  stop: 'max_iterations' | 'token_budget';
  orgId: string;
  threadId: string | null;
  turnId: string;
  readOnly: boolean;
}

export const UNANSWERED_LIMIT_MESSAGE = 'Agent request ended at its limit without an answer';

/** Sentry's capture shape for it: identifiers only, never the request or its text. */
export function unansweredLimitCaptureContext(event: UnansweredLimitEvent): OpsAlertCaptureContext {
  return {
    level: 'error',
    tags: { agent_stop: event.stop, read_only: String(event.readOnly) },
    extra: { orgId: event.orgId, threadId: event.threadId, turnId: event.turnId },
    fingerprint: ['agent-unanswered-limit', event.stop],
  };
}
