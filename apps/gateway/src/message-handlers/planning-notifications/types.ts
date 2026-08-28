import type { OperatorBinding } from '../../operator-notify.js';

export interface OperatorNotificationExclude {
  channel: OperatorBinding['channel'];
  deliveryKey: string;
}

// Honesty disclosure about what parking a plan card does to the operator's queue.
export type QueueNotice =
  | { kind: 'replaces'; customerName: string | null }
  | { kind: 'evicts'; customerName: string | null }
  | { kind: 'stacked'; waiting: number };

export interface ConversationStage {
  isFollowUp: boolean;
  newMessages: number;
}
