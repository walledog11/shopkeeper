import { isRecord } from '@shopkeeper/shared/guards';

import { readString } from '../values.js';

export type InstagramHealthStatus = 'healthy' | 'degraded' | 'reconnect_required';
export type InstagramTransport = 'meta_direct' | 'socialapi';

export function readInstagramMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata) || !isRecord(metadata.instagram)) return null;
  return metadata.instagram;
}

export function isInstagramLoginMetadata(metadata: unknown): boolean {
  return readInstagramMetadata(metadata)?.authModel === 'instagram_login';
}

export function isSocialApiMetadata(metadata: unknown): boolean {
  return readInstagramMetadata(metadata)?.transport === 'socialapi';
}

export function instagramTransport(metadata: unknown): InstagramTransport | null {
  if (isSocialApiMetadata(metadata)) return 'socialapi';
  if (isInstagramLoginMetadata(metadata)) return 'meta_direct';
  return null;
}

/** Direct Meta login row that is not on the SocialAPI transport. */
export function isMetaDirectInstagramMetadata(metadata: unknown): boolean {
  return isInstagramLoginMetadata(metadata) && !isSocialApiMetadata(metadata);
}

/** Pre–instagram_login rows and other non-SocialAPI shapes that cannot send replies. */
export function isLegacyInstagramMetadata(metadata: unknown): boolean {
  const instagram = readInstagramMetadata(metadata);
  if (!instagram) return true;
  if (instagram.transport === 'socialapi') return false;
  return instagram.authModel !== 'instagram_login';
}

export interface InstagramHealthSnapshot {
  errorCategory: string | null;
  errorCode: string | number | null;
  status: InstagramHealthStatus | null;
}

function parseHealthStatus(value: unknown): InstagramHealthStatus | null {
  return value === 'healthy' || value === 'degraded' || value === 'reconnect_required'
    ? value
    : null;
}

export function readInstagramHealth(metadata: unknown): InstagramHealthSnapshot {
  const instagram = readInstagramMetadata(metadata);
  if (!instagram) {
    return { errorCategory: null, errorCode: null, status: null };
  }
  const status = parseHealthStatus(instagram.healthStatus);
  const error = isRecord(instagram.lastHealthError) ? instagram.lastHealthError : null;
  const errorCategory = typeof error?.category === 'string' ? error.category : null;
  const errorCode = typeof error?.code === 'string' || typeof error?.code === 'number'
    ? error.code
    : null;
  return { errorCategory, errorCode, status };
}

export function hasVerifiedInstagramMessagingPermission(
  instagram: Record<string, unknown>,
  requiredScopes: readonly string[],
): boolean {
  if (instagram.permissionsVerified !== true) return true;
  const grantedScopes = instagram.grantedScopes;
  if (!Array.isArray(grantedScopes)) return false;
  return requiredScopes.every(scope => grantedScopes.includes(scope));
}

export function instagramReconnectRequiredByHealth(
  instagram: Record<string, unknown>,
): 'permission' | 'connection' | null {
  if (instagram.healthStatus !== 'reconnect_required') return null;
  const lastHealthError = isRecord(instagram.lastHealthError) ? instagram.lastHealthError : null;
  return lastHealthError?.category === 'permission' ? 'permission' : 'connection';
}

export function readInstagramSubscribedFields(instagram: Record<string, unknown>): string[] {
  if (!Array.isArray(instagram.subscribedFields)) return [];
  return instagram.subscribedFields.filter((field): field is string => typeof field === 'string');
}

export function instagramMessagesSubscriptionActive(instagram: Record<string, unknown>): boolean {
  return readInstagramSubscribedFields(instagram).includes('messages');
}

export function readSocialApiAccountId(instagram: Record<string, unknown>): string | null {
  return readString(instagram.socialApiAccountId);
}

export function readMetadataTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function readInstagramTokenIssuedAtMs(metadata: unknown, fallbackMs: number): number {
  const instagram = readInstagramMetadata(metadata) ?? {};
  return readMetadataTimestamp(instagram.accessTokenIssuedAt)
    ?? readMetadataTimestamp(instagram.lastRefreshAt)
    ?? fallbackMs;
}

export interface InstagramStoredHealthError {
  category: string;
  code: string | number | null;
  httpStatus: number;
  requestId: string | null;
  subcode: number | null;
}

export function mergeInstagramHealthMetadata(
  metadata: unknown,
  input: {
    error: InstagramStoredHealthError | null;
    now: Date;
    status: InstagramHealthStatus;
    subscriptionFields?: string[];
    successful?: boolean;
    tokenRefreshed?: boolean;
  },
): Record<string, unknown> {
  const root = isRecord(metadata) ? { ...metadata } : {};
  const current = readInstagramMetadata(metadata) ?? {};
  const checkedAt = input.now.toISOString();
  return {
    ...root,
    instagram: {
      ...current,
      healthStatus: input.status,
      lastHealthCheckAt: checkedAt,
      lastHealthError: input.error,
      ...(input.successful ? { lastSuccessfulHealthCheckAt: checkedAt } : {}),
      ...(input.subscriptionFields !== undefined
        ? {
            lastSubscriptionCheckAt: checkedAt,
            subscribedFields: input.subscriptionFields,
            ...(input.subscriptionFields.includes('messages')
              ? { lastSuccessfulSubscriptionAt: checkedAt }
              : {}),
          }
        : {}),
      ...(input.tokenRefreshed
        ? { accessTokenIssuedAt: checkedAt, lastRefreshAt: checkedAt }
        : {}),
    },
  };
}

export interface BuildInstagramLoginMetadataInput {
  accountType: string;
  grantedScopes: string[];
  permissionsVerified: boolean;
  subscriptionVerifiedAt: Date;
  username: string;
}

export function buildInstagramLoginMetadata(
  current: unknown,
  input: BuildInstagramLoginMetadataInput,
): Record<string, unknown> {
  const root = isRecord(current) ? { ...current } : {};
  const instagram = isRecord(root.instagram) ? { ...root.instagram } : {};

  return {
    ...root,
    instagram: {
      ...instagram,
      accessTokenIssuedAt: input.subscriptionVerifiedAt.toISOString(),
      accountType: input.accountType,
      authModel: 'instagram_login',
      grantedScopes: input.grantedScopes,
      lastSuccessfulSubscriptionAt: input.subscriptionVerifiedAt.toISOString(),
      permissionsVerified: input.permissionsVerified,
      subscribedFields: ['messages'],
      username: input.username,
    },
  };
}

export interface BuildSocialApiInstagramMetadataInput {
  brandId: string;
  connectedAt: Date;
  providerAccountId: string;
  username: string;
}

export function buildSocialApiInstagramMetadata(
  current: unknown,
  input: BuildSocialApiInstagramMetadataInput,
): Record<string, unknown> {
  const root = isRecord(current) ? { ...current } : {};

  return {
    ...root,
    instagram: {
      authModel: 'socialapi',
      transport: 'socialapi',
      socialApiAccountId: input.providerAccountId,
      socialApiBrandId: input.brandId,
      externalAccountIdSource: 'provider',
      username: input.username,
      connectedAt: input.connectedAt.toISOString(),
    },
  };
}
