import type { EmailProvider } from './types.js';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getEmailProvider(integration: { metadata?: unknown | null }): EmailProvider {
  const meta = integration.metadata;
  if (meta && typeof meta === 'object' && 'provider' in meta) {
    const value = (meta as { provider?: unknown }).provider;
    if (value === 'gmail' || value === 'outlook' || value === 'postmark') return value;
  }
  return 'postmark';
}

export function getEmailProviderLabel(integration: { metadata?: unknown | null }): string {
  const provider = getEmailProvider(integration);
  return provider === 'gmail' ? 'Gmail' : provider === 'outlook' ? 'Outlook' : 'Forwarding';
}

export function getEmailReauthorizePath(integration: { metadata?: unknown | null }): string | null {
  const provider = getEmailProvider(integration);
  if (provider === 'gmail') return '/api/integrations/gmail/auth';
  if (provider === 'outlook') return '/api/integrations/outlook/auth';
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
  if (provider !== 'gmail' && provider !== 'outlook') return null;
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
