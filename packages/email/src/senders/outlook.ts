import { getEmailLogger } from '../logger.js';
import { buildMimeBase64 } from '../mime-build.js';
import { getEmailOAuthClient, persistRefreshedToken, requestTokenRefresh } from '../token.js';
import { EmailNotConfiguredError, type EmailSender, type OutboundEmail } from '../types.js';

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
    const client = getEmailOAuthClient('outlook');
    if (!client) throw new EmailNotConfiguredError('Outlook OAuth credentials missing');

    const result = await requestTokenRefresh('outlook', this.integration.refreshToken!, client);
    if (!result.ok) {
      getEmailLogger().error(
        { status: result.status, body: result.body, integrationId: this.integration.id },
        '[OutlookSender] Token refresh failed',
      );
      throw new Error(`Outlook token refresh failed: ${result.status}`);
    }

    this.accessToken = result.token.accessToken;
    this.tokenExpiresAt = result.token.expiresAt;
    await persistRefreshedToken(this.integration.id, result.token);
  }
}
