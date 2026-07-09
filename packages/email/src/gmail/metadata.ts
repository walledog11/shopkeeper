import type { GmailWatchErrorCategory } from './errors.js';
import type { GmailWatchRequest } from './client.js';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const GMAIL_HISTORY_ID_PATTERN = /^\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getGmailMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata) || !isRecord(metadata.gmail)) return null;
  return metadata.gmail;
}

export function metadataWithGmailState(
  metadata: unknown,
  gmailState: Record<string, unknown>,
  options: { clearLastError?: boolean; confirmReadScope?: boolean } = {},
): Record<string, unknown> {
  const existing = isRecord(metadata) ? metadata : {};
  const existingGmail = isRecord(existing.gmail) ? existing.gmail : {};
  const gmailBase = options.clearLastError
    ? Object.fromEntries(
        Object.entries(existingGmail).filter(([key]) => key !== 'lastError'),
      )
    : existingGmail;
  const oauthScopes = Array.isArray(existing.oauthScopes)
    ? existing.oauthScopes.filter((scope): scope is string => typeof scope === 'string')
    : [];

  return {
    ...existing,
    provider: 'gmail',
    ...(options.confirmReadScope && !oauthScopes.includes(GMAIL_READONLY_SCOPE)
      ? { oauthScopes: [...oauthScopes, GMAIL_READONLY_SCOPE] }
      : {}),
    gmail: {
      ...gmailBase,
      ...gmailState,
    },
  };
}

export function isValidGmailHistoryId(value: string): boolean {
  return GMAIL_HISTORY_ID_PATTERN.test(value);
}

export function readGmailHistoryId(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return isValidGmailHistoryId(trimmed) ? trimmed : '';
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  return '';
}

export function readStoredGmailHistoryId(metadata: unknown): string | null {
  const historyId = getGmailMetadata(metadata)?.historyId;
  return typeof historyId === 'string' && isValidGmailHistoryId(historyId)
    ? historyId
    : null;
}

export function historyIdAtOrAfter(left: string, right: string): boolean {
  return BigInt(left) >= BigInt(right);
}

export function maxGmailHistoryId(left: string, right: string): string {
  return historyIdAtOrAfter(left, right) ? left : right;
}

export function hasNativeGmailWatch(metadata: unknown): boolean {
  const gmail = getGmailMetadata(metadata);
  if (!gmail) return false;
  return (
    typeof gmail.historyId === 'string'
    || typeof gmail.watchExpiration === 'string'
    || gmail.inboundStatus === 'active'
  );
}

export function buildInboxWatchRequest(topicName: string): GmailWatchRequest {
  return {
    topicName,
    labelIds: ['INBOX'],
    labelFilterBehavior: 'include',
  };
}

function readNonNegativeInteger(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

export interface GmailWatchFailureUpdate {
  metadata: Record<string, unknown>;
  markReauthorization: boolean;
}

export function buildGmailWatchFailureUpdate(
  metadata: unknown,
  category: GmailWatchErrorCategory,
  now: Date,
): GmailWatchFailureUpdate {
  const gmail = getGmailMetadata(metadata);
  const failureCount = readNonNegativeInteger(gmail?.watchFailureCount) + 1;
  const authenticationFailure = category === 'watch_authentication';
  return {
    metadata: metadataWithGmailState(metadata, {
      inboundStatus: authenticationFailure ? 'reauthorization_required' : 'degraded',
      lastError: category,
      watchFailureCount: failureCount,
      watchLastAttemptAt: now.toISOString(),
    }),
    markReauthorization: authenticationFailure,
  };
}
