import crypto from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  oauthPageRedirect,
} from './oauth-callback';
import logger from '@/lib/server/logger';
import { safeReturnTo } from '@/lib/security/safe-return-to';
import { timingSafeIncludes } from '@/lib/security/timing-safe';

const BASE_OAUTH_COOKIE_KEYS = ['state', 'org', 'user', 'return'] as const;

export const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 600,
  path: '/',
};

export interface OAuthSessionConfig {
  prefix: string;
}

export interface AuthenticatedOAuthSession {
  userId: string;
  orgId: string;
}

export async function requireAuthenticatedOAuthSession(): Promise<AuthenticatedOAuthSession | null> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return null;
  return { userId, orgId };
}

export async function createOAuthSessionCookies(
  request: Request,
  config: OAuthSessionConfig,
  session: AuthenticatedOAuthSession,
  extraCookies: Record<string, string | null | undefined> = {},
): Promise<{ state: string; returnTo: string | null }> {
  const { searchParams } = new URL(request.url);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const state = crypto.randomBytes(16).toString('hex');
  const cookieStore = await cookies();

  cookieStore.set(oauthCookieName(config.prefix, 'state'), state, OAUTH_COOKIE_OPTIONS);
  cookieStore.set(oauthCookieName(config.prefix, 'org'), session.orgId, OAUTH_COOKIE_OPTIONS);
  cookieStore.set(oauthCookieName(config.prefix, 'user'), session.userId, OAUTH_COOKIE_OPTIONS);
  if (returnTo) {
    cookieStore.set(oauthCookieName(config.prefix, 'return'), returnTo, OAUTH_COOKIE_OPTIONS);
  }
  for (const [key, value] of Object.entries(extraCookies)) {
    if (value) cookieStore.set(oauthCookieName(config.prefix, key), value, OAUTH_COOKIE_OPTIONS);
  }

  return { state, returnTo };
}

export interface OAuthCallbackSession {
  attemptId: string;
  clerkOrgId?: string;
  returnTo: string | null;
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
  prefix: string;
  state: string | null;
  stateMismatchError?: string;
}): Promise<OAuthCallbackSessionResult> {
  const cookieStore = await cookies();
  const savedState = cookieStore.get(oauthCookieName(options.prefix, 'state'))?.value;
  const clerkOrgId = cookieStore.get(oauthCookieName(options.prefix, 'org'))?.value;
  const savedUserId = cookieStore.get(oauthCookieName(options.prefix, 'user'))?.value;
  const returnTo = safeReturnTo(cookieStore.get(oauthCookieName(options.prefix, 'return'))?.value);
  const extra: Record<string, string | undefined> = {};

  for (const key of options.extraCookieKeys ?? []) {
    extra[key] = cookieStore.get(oauthCookieName(options.prefix, key))?.value;
  }

  for (const key of [...BASE_OAUTH_COOKIE_KEYS, ...(options.extraCookieKeys ?? [])]) {
    cookieStore.delete(oauthCookieName(options.prefix, key));
  }

  const mismatchError = options.stateMismatchError ?? 'state_mismatch';
  if (!savedState || !options.state || !timingSafeIncludes([savedState], options.state)) {
    logger.error(`[${options.logPrefix}] State mismatch — possible CSRF attempt`);
    return {
      ok: false,
      response: oauthPageRedirect(`${options.appUrl}/dashboard/integrations?error=${mismatchError}`),
      analyticsContext: {
        attemptId: savedState,
        clerkOrganizationId: clerkOrgId,
      },
    };
  }

  const { userId: currentUserId } = await auth();
  if (!currentUserId || currentUserId !== savedUserId) {
    logger.error(
      { savedUserId, currentUserId },
      `[${options.logPrefix}] User session mismatch — possible CSRF attempt`,
    );
    return {
      ok: false,
      response: oauthPageRedirect(`${options.appUrl}/dashboard/integrations?error=${mismatchError}`),
      analyticsContext: {
        attemptId: savedState,
        clerkOrganizationId: clerkOrgId,
      },
    };
  }

  return {
    ok: true,
    session: {
      attemptId: savedState,
      clerkOrgId,
      returnTo,
      extra,
    },
  };
}

function oauthCookieName(prefix: string, key: string): string {
  return `${prefix}_oauth_${key}`;
}
