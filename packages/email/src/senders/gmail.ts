import { getEmailLogger } from '../logger.js';
import { buildRawMime } from '../mime-build.js';
import { getEmailOAuthClient, persistRefreshedToken, requestTokenRefresh } from '../token.js';
import {
  EmailNotConfiguredError,
  EmailProviderRequestTimeoutError,
  type EmailSender,
  type EmailSendResult,
  type OutboundEmail,
} from '../types.js';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REFRESH_LEEWAY_MS = 60_000;
const SEND_TIMEOUT_MS = 15_000;

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

  async send(email: OutboundEmail): Promise<EmailSendResult> {
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

    const payload = await res.json().catch(() => null) as { id?: unknown } | null;
    if (!payload || typeof payload.id !== 'string' || payload.id.length === 0) {
      throw new Error('Gmail accepted the send but returned no message id');
    }
    return { providerMessageId: payload.id };
  }

  private shouldRefreshProactively(): boolean {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt.getTime() - REFRESH_LEEWAY_MS < Date.now();
  }

  private async postSend(raw: string): Promise<Response> {
    try {
      return await fetch(SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      if (
        error instanceof Error
        && (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new EmailProviderRequestTimeoutError(
          'gmail',
          'message send',
          SEND_TIMEOUT_MS,
          error,
        );
      }
      throw error;
    }
  }

  private async refresh(): Promise<void> {
    const client = getEmailOAuthClient();
    if (!client) throw new EmailNotConfiguredError('Gmail OAuth credentials missing');

    const result = await requestTokenRefresh('gmail', this.integration.refreshToken!, client);
    if (!result.ok) {
      getEmailLogger().error(
        { status: result.status, body: result.body, integrationId: this.integration.id },
        '[GmailSender] Token refresh failed',
      );
      throw new Error(`Gmail token refresh failed: ${result.status}`);
    }

    this.accessToken = result.token.accessToken;
    this.tokenExpiresAt = result.token.expiresAt;
    await persistRefreshedToken(this.integration.id, result.token);
  }
}
