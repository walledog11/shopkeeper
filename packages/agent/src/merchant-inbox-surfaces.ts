import { CHANNEL_TYPE } from './thread-constants.js';

/** Thread channels hidden from merchant-facing inbox search and similar surfaces. */
export const MERCHANT_INBOX_INTERNAL_CHANNEL_TYPES = [
  CHANNEL_TYPE.OPERATOR,
  CHANNEL_TYPE.DASHBOARD_AGENT,
] as const;

export function merchantInboxInternalChannelFilter() {
  return { notIn: [...MERCHANT_INBOX_INTERNAL_CHANNEL_TYPES] };
}
