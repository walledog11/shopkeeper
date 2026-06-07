import { db } from '@shopkeeper/db';
import logger from '@/lib/server/logger';
import { EmailNotConfiguredError, type EmailSender, type OutboundEmail } from './types';
import { buildMimeBase64 } from './mime';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';
const REFRESH_LEEWAY_MS = 60_000;

export interface OutlookIntegration {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export class OutlookSender implements EmailSender {
  private accessToken: string | null;
  private tokenExpiresAt: Date | null;

  constructor(private readonly integration: OutlookIntegration) {
    this.accessToken = integration.accessToken;
    this.tokenExpiresAt = integration.tokenExpiresAt;
  }

  async send(email: OutboundEmail): Promise<void> {
    if (!this.integration.refreshToken) throw new EmailNotConfiguredError('Outlook refresh token missing');

    if (this.shouldRefreshProactively()) await this.refresh();
    if (!this.accessToken) throw new EmailNotConfiguredError('Outlook access token missing');

    const mime = buildMimeBase64(email);
    let res = await this.postSend(mime);

    if (res.status === 401) {
      await this.refresh();
      res = await this.postSend(mime);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Outlook send failed: ${res.status} ${body}`);
    }
  }

  private shouldRefreshProactively(): boolean {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt.getTime() - REFRESH_LEEWAY_MS < Date.now();
  }

  private async postSend(mime: string): Promise<Response> {
    return fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: mime,
    });
  }

  private async refresh(): Promise<void> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new EmailNotConfiguredError('Outlook OAuth credentials missing');

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
      logger.error({ status: res.status, body, integrationId: this.integration.id }, '[OutlookSender] Token refresh failed');
      throw new Error(`Outlook token refresh failed: ${res.status}`);
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
