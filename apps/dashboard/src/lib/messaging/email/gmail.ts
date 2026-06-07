import { db } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import { EmailNotConfiguredError, type EmailSender, type OutboundEmail } from './types';
import { buildRawMime } from './mime';

export { buildRawMime } from './mime';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REFRESH_LEEWAY_MS = 60_000;

export interface GmailIntegration {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export class GmailSender implements EmailSender {
  private accessToken: string | null;
  private tokenExpiresAt: Date | null;

  constructor(private readonly integration: GmailIntegration) {
    this.accessToken = integration.accessToken;
    this.tokenExpiresAt = integration.tokenExpiresAt;
  }

  async send(email: OutboundEmail): Promise<void> {
    if (!this.integration.refreshToken) throw new EmailNotConfiguredError('Gmail refresh token missing');

    if (this.shouldRefreshProactively()) await this.refresh();
    if (!this.accessToken) throw new EmailNotConfiguredError('Gmail access token missing');

    const raw = buildRawMime(email);
    let res = await this.postSend(raw);

    if (res.status === 401) {
      await this.refresh();
      res = await this.postSend(raw);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gmail send failed: ${res.status} ${body}`);
    }
  }

  private shouldRefreshProactively(): boolean {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt.getTime() - REFRESH_LEEWAY_MS < Date.now();
  }

  private async postSend(raw: string): Promise<Response> {
    return fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
  }

  private async refresh(): Promise<void> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new EmailNotConfiguredError('Gmail OAuth credentials missing');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.integration.refreshToken!,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ status: res.status, body, integrationId: this.integration.id }, '[GmailSender] Token refresh failed');
      throw new Error(`Gmail token refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    await db.integration.update({
      where: { id: this.integration.id },
      data: {
        accessToken: this.accessToken,
        tokenExpiresAt: this.tokenExpiresAt,
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
      },
    });
  }
}
