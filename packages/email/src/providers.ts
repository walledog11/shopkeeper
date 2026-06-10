import type { EmailProvider } from './types.js';

const EXPLICIT_EXPIRED_TOKEN_MS = 0;

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

function isOAuthEmailProvider(integration: { metadata?: unknown | null }): boolean {
  const provider = getEmailProvider(integration);
  return provider === 'gmail' || provider === 'outlook';
}

export function isEmailAuthReauthorizationRequired(integration: {
  metadata?: unknown | null;
  tokenExpiresAt?: string | Date | null;
}): boolean {
  if (!isOAuthEmailProvider(integration) || !integration.tokenExpiresAt) return false;
  const expiresAt = integration.tokenExpiresAt instanceof Date
    ? integration.tokenExpiresAt
    : new Date(integration.tokenExpiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= EXPLICIT_EXPIRED_TOKEN_MS;
}
