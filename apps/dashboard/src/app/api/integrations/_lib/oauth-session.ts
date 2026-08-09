import crypto from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { oauthCompleteResponse } from './oauth-callback';
import type { OAuthErrorCode, OAuthFlowMode, OAuthProvider } from '@/lib/integrations/oauth-contract';
import { isOAuthFlowMode } from '@/lib/integrations/oauth-contract';
import { ADMIN_REQUIRED_MESSAGE, isOrgAdmin } from '@/lib/api/permissions';
import logger from '@/lib/server/logger';
import { safeReturnTo } from '@/lib/security/safe-return-to';

const OAUTH_STATE_PATTERN = /^[a-f0-9]{32}$/;

export const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 600,
  path: '/',
};

export interface OAuthSessionConfig {
  provider: OAuthProvider;
}

export interface AuthenticatedOAuthSession {
  userId: string;
  orgId: string;
}

export type OAuthSessionResult =
  | { ok: true; session: AuthenticatedOAuthSession }
  | { ok: false; response: NextResponse };

interface StoredOAuthAttempt {
  userId: string;
  orgId: string;
  returnTo: string | null;
  mode: OAuthFlowMode;
  extra: Record<string, string>;
}

// The single chokepoint for starting any provider connect flow. Connecting
// binds provider credentials to the workspace, so it is admin-only.
export async function requireAuthenticatedOAuthSession(): Promise<OAuthSessionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await isOrgAdmin())) {
    return {
      ok: false,
      response: NextResponse.json({ error: ADMIN_REQUIRED_MESSAGE }, { status: 403 }),
    };
  }
  return { ok: true, session: { userId, orgId } };
}

export async function createOAuthSessionCookies(
  request: Request,
  config: OAuthSessionConfig,
  session: AuthenticatedOAuthSession,
  extra: Record<string, string | null | undefined> = {},
): Promise<{ state: string; returnTo: string | null; mode: OAuthFlowMode }> {
  const { searchParams } = new URL(request.url);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const mode = isOAuthFlowMode(searchParams.get('mode')) ? searchParams.get('mode') as OAuthFlowMode : 'redirect';
  const state = crypto.randomBytes(16).toString('hex');
  const attempt: StoredOAuthAttempt = {
    userId: session.userId,
    orgId: session.orgId,
    returnTo,
    mode,
    extra: Object.fromEntries(
      Object.entries(extra).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ),
  };
  const cookieStore = await cookies();
  cookieStore.set(oauthAttemptCookieName(config.provider, state), encodeAttempt(attempt), OAUTH_COOKIE_OPTIONS);
  return { state, returnTo, mode };
}

export interface OAuthCallbackSession {
  attemptId: string;
  clerkOrgId?: string;
  returnTo: string | null;
  mode: OAuthFlowMode;
  extra: Record<string, string | undefined>;
}

export type OAuthCallbackSessionResult =
  | { ok: true; session: OAuthCallbackSession }
  | {
      ok: false;
      response: NextResponse;
      analyticsContext: {
        attemptId?: string;
        clerkOrganizationId?: string;
      };
    };

export async function validateOAuthCallbackSession(options: {
  appUrl: string;
  extraCookieKeys?: readonly string[];
  logPrefix: string;
  provider: OAuthProvider;
  state: string | null;
  stateMismatchError?: OAuthErrorCode;
}): Promise<OAuthCallbackSessionResult> {
  const validState = options.state && OAUTH_STATE_PATTERN.test(options.state)
    ? options.state
    : null;
  const cookieStore = await cookies();
  const cookieName = validState ? oauthAttemptCookieName(options.provider, validState) : null;
  const attempt = cookieName ? decodeAttempt(cookieStore.get(cookieName)?.value) : null;
  if (cookieName) cookieStore.delete(cookieName);

  const mismatchError = options.stateMismatchError ?? 'state_mismatch';
  if (!validState || !attempt) {
    logger.error(`[${options.logPrefix}] State mismatch — possible CSRF attempt`);
    return {
      ok: false,
      response: oauthCompleteResponse(options.appUrl, {
        outcome: { status: 'failed', provider: options.provider, error: mismatchError },
      }),
      analyticsContext: { attemptId: validState ?? undefined },
    };
  }

  const { userId: currentUserId } = await auth();
  if (!currentUserId || currentUserId !== attempt.userId) {
    logger.error(
      { savedUserId: attempt.userId, currentUserId },
      `[${options.logPrefix}] User session mismatch — possible CSRF attempt`,
    );
    return {
      ok: false,
      response: oauthCompleteResponse(options.appUrl, {
        outcome: { status: 'failed', provider: options.provider, error: mismatchError },
        mode: attempt.mode,
        returnTo: attempt.returnTo,
      }),
      analyticsContext: {
        attemptId: validState,
        clerkOrganizationId: attempt.orgId,
      },
    };
  }

  const extra: Record<string, string | undefined> = {};
  for (const key of options.extraCookieKeys ?? []) extra[key] = attempt.extra[key];

  return {
    ok: true,
    session: {
      attemptId: validState,
      clerkOrgId: attempt.orgId,
      returnTo: attempt.returnTo,
      mode: attempt.mode,
      extra,
    },
  };
}

function oauthAttemptCookieName(provider: OAuthProvider, state: string): string {
  return `${provider}_oauth_attempt_${state}`;
}

function encodeAttempt(attempt: StoredOAuthAttempt): string {
  return Buffer.from(JSON.stringify(attempt), 'utf8').toString('base64url');
}

function decodeAttempt(value: string | undefined): StoredOAuthAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<StoredOAuthAttempt>;
    if (
      typeof parsed.userId !== 'string'
      || typeof parsed.orgId !== 'string'
      || (parsed.returnTo !== null && typeof parsed.returnTo !== 'string')
      || !parsed.extra
      || typeof parsed.extra !== 'object'
      || Array.isArray(parsed.extra)
    ) return null;
    return {
      userId: parsed.userId,
      orgId: parsed.orgId,
      returnTo: safeReturnTo(parsed.returnTo),
      mode: isOAuthFlowMode(parsed.mode) ? parsed.mode : 'redirect',
      extra: Object.fromEntries(
        Object.entries(parsed.extra).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    };
  } catch {
    return null;
  }
}
