import { getEmailProvider } from '@shopkeeper/email';
import { getEmailInboundMode } from '../../config/env.js';
import { isGmailNativeInboundEnabled } from '../../config/runtime-config.js';
import { isRecord } from '../../lib/typing.js';
import type { GmailSyncIntegration } from './types.js';

export function isNativeGmailInboundEnabled(
  integration: GmailSyncIntegration,
  allowIncompleteRecovery: boolean,
): boolean {
  if (!isGmailNativeInboundEnabled()) return false;
  if (getEmailInboundMode() === 'postmark') return false;
  if (getEmailProvider(integration) !== 'gmail' || !isRecord(integration.metadata)) return false;
  if (integration.metadata.inboundMode === 'postmark') return false;
  const inboundStatus = isRecord(integration.metadata.gmail)
    ? integration.metadata.gmail.inboundStatus
    : null;
  const lastError = isRecord(integration.metadata.gmail)
    ? integration.metadata.gmail.lastError
    : null;
  return inboundStatus === 'active'
    || (
      allowIncompleteRecovery
      && inboundStatus === 'degraded'
      && lastError === 'sync_recovery_truncated'
    );
}

export function normalizeAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function providerMessageKey(messageId: string): string {
  return `gmail:${messageId}`;
}
