import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from "@shopkeeper/agent/guards";
import {
  isOAuthFlowMode,
  isOAuthProvider,
  type OAuthFlowMode,
  type OAuthProvider,
} from '@/lib/integrations/oauth-contract';
import { safeReturnTo } from '@/lib/security/safe-return-to';

const OAUTH_ATTEMPT_VERSION = 1;
const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
const OAUTH_STATE_PATTERN = /^[a-f0-9]{32}$/;
const SIGNATURE_BYTES = 32;

export interface OAuthAttempt {
  version: typeof OAUTH_ATTEMPT_VERSION;
  provider: OAuthProvider;
  state: string;
  userId: string;
  orgId: string;
  returnTo: string | null;
  mode: OAuthFlowMode;
  extra: Record<string, string>;
  issuedAt: number;
  expiresAt: number;
}

export type NewOAuthAttempt = Omit<OAuthAttempt, 'version' | 'issuedAt' | 'expiresAt'>;

function signingSecret(): string {
  const secret = process.env.OAUTH_ATTEMPT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('OAUTH_ATTEMPT_SECRET must be configured with at least 32 characters');
  }
  return secret;
}

function signatureFor(encoded: string): Buffer {
  return createHmac('sha256', signingSecret())
    .update(`shopkeeper-oauth-attempt.v${OAUTH_ATTEMPT_VERSION}.${encoded}`)
    .digest();
}


function parseExtra(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseAttempt(value: unknown): OAuthAttempt | null {
  if (!isRecord(value)) return null;
  if (value.version !== OAUTH_ATTEMPT_VERSION) return null;
  if (!isOAuthProvider(value.provider) || !isOAuthFlowMode(value.mode)) return null;
  if (typeof value.state !== 'string' || !OAUTH_STATE_PATTERN.test(value.state)) return null;
  if (typeof value.userId !== 'string' || !value.userId) return null;
  if (typeof value.orgId !== 'string' || !value.orgId) return null;
  if (value.returnTo !== null && typeof value.returnTo !== 'string') return null;
  if (value.returnTo !== null && safeReturnTo(value.returnTo) !== value.returnTo) return null;
  if (
    typeof value.issuedAt !== 'number'
    || typeof value.expiresAt !== 'number'
    || !Number.isSafeInteger(value.issuedAt)
    || !Number.isSafeInteger(value.expiresAt)
  ) return null;
  if (value.expiresAt <= value.issuedAt) return null;
  const extra = parseExtra(value.extra);
  if (!extra) return null;

  return {
    version: OAUTH_ATTEMPT_VERSION,
    provider: value.provider,
    state: value.state,
    userId: value.userId,
    orgId: value.orgId,
    returnTo: value.returnTo,
    mode: value.mode,
    extra,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  };
}

export function sealOAuthAttempt(input: NewOAuthAttempt, now = Date.now()): string {
  const attempt: OAuthAttempt = {
    version: OAUTH_ATTEMPT_VERSION,
    ...input,
    issuedAt: now,
    expiresAt: now + OAUTH_ATTEMPT_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(attempt), 'utf8').toString('base64url');
  return `${encoded}.${signatureFor(encoded).toString('base64url')}`;
}

export function unsealOAuthAttempt(
  token: string | undefined,
  expected: { provider: OAuthProvider; state: string },
  now = Date.now(),
): OAuthAttempt | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, serializedSignature] = parts;

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(serializedSignature, 'base64url');
  } catch {
    return null;
  }
  if (
    suppliedSignature.length !== SIGNATURE_BYTES
    || suppliedSignature.toString('base64url') !== serializedSignature
    || !timingSafeEqual(suppliedSignature, signatureFor(encoded))
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  const attempt = parseAttempt(parsed);
  if (!attempt) return null;
  if (attempt.provider !== expected.provider || attempt.state !== expected.state) return null;
  if (attempt.issuedAt > now || attempt.expiresAt <= now) return null;
  return attempt;
}
