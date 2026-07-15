import type { EmailProvider } from './types.js';
import { getGmailMetadata } from './gmail/metadata.js';

const EXPLICIT_EXPIRED_TOKEN_MS = 0;
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export type EmailAuthReauthorizationReason =
  | 'expired_grant'
  | 'missing_gmail_read_scope';

export type GmailInboundStatus =
  | 'pending'
  | 'active'
  | 'degraded'
  | 'reauthorization_required';

export type GmailAccountType = 'personal' | 'workspace';

const PERSONAL_GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getEmailProvider(integration: {
  emailProvider?: EmailProvider | null;
  metadata?: unknown | null;
}): EmailProvider {
  if (integration.emailProvider === 'gmail' || integration.emailProvider === 'postmark') {
    return integration.emailProvider;
  }
  const meta = integration.metadata;
  if (meta && typeof meta === 'object' && 'provider' in meta) {
    const value = (meta as { provider?: unknown }).provider;
    if (value === 'gmail' || value === 'postmark') return value;
  }
  return 'postmark';
}

export function getEmailProviderLabel(integration: {
  emailProvider?: EmailProvider | null;
  metadata?: unknown | null;
}): string {
  const provider = getEmailProvider(integration);
  return provider === 'gmail' ? 'Gmail' : 'Forwarding';
}

export function getEmailReauthorizePath(integration: {
  emailProvider?: EmailProvider | null;
  metadata?: unknown | null;
}): string | null {
  const provider = getEmailProvider(integration);
  if (provider === 'gmail') return '/api/integrations/gmail/auth';
  return null;
}

function hasExplicitExpiredToken(tokenExpiresAt: string | Date | null | undefined): boolean {
  if (!tokenExpiresAt) return false;
  const expiresAt = tokenExpiresAt instanceof Date
    ? tokenExpiresAt
    : new Date(tokenExpiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= EXPLICIT_EXPIRED_TOKEN_MS;
}

function hasOAuthScope(metadata: unknown, requiredScope: string): boolean {
  if (!isRecord(metadata) || !Array.isArray(metadata.oauthScopes)) return false;
  return metadata.oauthScopes.some((scope) => scope === requiredScope);
}

export function getGmailInboundStatus(
  integration: { metadata?: unknown | null },
): GmailInboundStatus | null {
  if (getEmailProvider(integration) !== 'gmail' || !isRecord(integration.metadata)) return null;
  const gmail = integration.metadata.gmail;
  if (!isRecord(gmail)) return null;
  const status = gmail.inboundStatus;
  return status === 'pending'
    || status === 'active'
    || status === 'degraded'
    || status === 'reauthorization_required'
    ? status
    : null;
}

export function getEmailAuthReauthorizationReason(integration: {
  metadata?: unknown | null;
  tokenExpiresAt?: string | Date | null;
}): EmailAuthReauthorizationReason | null {
  const provider = getEmailProvider(integration);
  if (provider !== 'gmail') return null;
  if (hasExplicitExpiredToken(integration.tokenExpiresAt)) return 'expired_grant';
  if (provider === 'gmail' && !hasOAuthScope(integration.metadata, GMAIL_READONLY_SCOPE)) {
    return 'missing_gmail_read_scope';
  }
  return null;
}

export function isEmailAuthReauthorizationRequired(integration: {
  metadata?: unknown | null;
  tokenExpiresAt?: string | Date | null;
}): boolean {
  return getEmailAuthReauthorizationReason(integration) !== null;
}

export function getGmailWatchFailureCount(integration: { metadata?: unknown | null }): number {
  const count = getGmailMetadata(integration.metadata)?.watchFailureCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0;
}

export function getGmailLastSyncedAt(integration: { metadata?: unknown | null }): string | null {
  const value = getGmailMetadata(integration.metadata)?.lastSyncedAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function isGmailNativeInboundEnrolled(integration: { metadata?: unknown | null }): boolean {
  if (!isRecord(integration.metadata)) return false;
  const inboundMode = integration.metadata.inboundMode;
  return inboundMode === 'hybrid'
    || inboundMode === 'native'
    || getGmailInboundStatus(integration) !== null;
}

export function isPersonalGmailAddress(email: string): boolean {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return !!domain && PERSONAL_GMAIL_DOMAINS.has(domain);
}

export function resolveGmailAccountType(
  userEmail: string,
  hostedDomain?: string | null,
): GmailAccountType {
  if (hostedDomain) return 'workspace';
  return isPersonalGmailAddress(userEmail) ? 'personal' : 'workspace';
}

export function getGmailAccountType(integration: {
  metadata?: unknown | null;
  externalAccountId: string;
}): GmailAccountType {
  const accountType = getGmailMetadata(integration.metadata)?.accountType;
  if (accountType === 'personal' || accountType === 'workspace') return accountType;
  return isPersonalGmailAddress(integration.externalAccountId) ? 'personal' : 'workspace';
}
