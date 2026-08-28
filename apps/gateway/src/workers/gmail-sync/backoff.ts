import { isGmailApiError } from '@shopkeeper/email';
import {
  GMAIL_RETRY_BASE_MS,
  GMAIL_RETRY_MAX_MS,
} from './constants.js';

export function calculateGmailSyncBackoff(
  attemptsMade: number,
  error: Error | undefined,
  random: () => number = Math.random,
): number {
  if (error instanceof RangeError) {
    return -1;
  }

  if (
    isGmailApiError(error)
    && !error.retryable
    && error.kind !== 'stale_history'
  ) {
    return -1;
  }

  const exponential = Math.min(
    GMAIL_RETRY_BASE_MS * (2 ** Math.max(0, attemptsMade - 1)),
    15 * 60 * 1_000,
  );
  const requested = isGmailApiError(error) && error.retryAfterMs !== undefined
    ? Math.max(exponential, error.retryAfterMs)
    : exponential;
  const jittered = requested + Math.floor(requested * 0.2 * random());
  return Math.min(jittered, GMAIL_RETRY_MAX_MS);
}
