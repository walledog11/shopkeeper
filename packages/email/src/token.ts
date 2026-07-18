import { db } from '@shopkeeper/db';
import type { EmailOAuthProvider } from './types.js';

const TOKEN_ENDPOINT: Record<EmailOAuthProvider, string> = {
  gmail: 'https://oauth2.googleapis.com/token',
};

// The token refresh runs on the Gmail sync worker's hot path; bound it so a
// stalled OAuth socket can't hold the worker past its lock window (AUD-015).
const TOKEN_REFRESH_TIMEOUT_MS = 15_000;

export interface EmailOAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface RefreshedToken {
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
}

export type TokenRefreshResult =
  | { ok: true; token: RefreshedToken }
  | { ok: false; status: number | null; transient: boolean; body?: string };

export function getEmailOAuthClient(): EmailOAuthClient | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function requestTokenRefresh(
  provider: EmailOAuthProvider,
  refreshToken: string,
  client: EmailOAuthClient,
  timeoutMs: number = TOKEN_REFRESH_TIMEOUT_MS,
): Promise<TokenRefreshResult> {
  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Network, transient, or timeout failure — caller should not treat as a dead grant.
    return { ok: false, status: null, transient: true };
  }

  if (res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { access_token?: string; expires_in?: number; refresh_token?: string }
      | null;
    if (!data?.access_token) {
      return { ok: false, status: res.status, transient: false };
    }
    return {
      ok: true,
      token: {
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
      },
    };
  }

  // 4xx (invalid_grant) is a dead refresh token; 5xx is provider-side transient.
  const body = await res.text().catch(() => '');
  return { ok: false, status: res.status, transient: res.status >= 500, body };
}

export async function persistRefreshedToken(integrationId: string, token: RefreshedToken): Promise<void> {
  await db.integration.update({
    where: { id: integrationId },
    data: {
      accessToken: token.accessToken,
      tokenExpiresAt: token.expiresAt,
      ...(token.refreshToken && { refreshToken: token.refreshToken }),
    },
  });
}
