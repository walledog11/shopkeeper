import { describe, it, expect } from 'vitest';
import pino from 'pino';
import {
  PINO_REDACT_PATHS,
  scrubValue,
  REDACTED,
  REDACTED_EMAIL,
} from './redaction.js';

describe('scrubValue', () => {
  it('redacts snake_case provider token fields in OAuth payloads', () => {
    const payload = {
      access_token: 'ig-short-lived',
      refresh_token: 'ig-refresh',
      id_token: 'oidc-id',
      client_secret: 'app-secret',
      expires_in: 3600,
      token_type: 'bearer',
      data: [
        {
          id: 'page-1',
          name: 'My Page',
          access_token: 'page-token',
          instagram_business_account: { id: 'ig-1', username: 'shop' },
        },
      ],
    };

    const out = scrubValue(payload) as Record<string, unknown>;
    expect(out.access_token).toBe(REDACTED);
    expect(out.refresh_token).toBe(REDACTED);
    expect(out.id_token).toBe(REDACTED);
    expect(out.client_secret).toBe(REDACTED);
    expect(out.expires_in).toBe(3600);
    expect(out.token_type).toBe(REDACTED);

    const pages = out.data as Array<Record<string, unknown>>;
    expect(pages[0].id).toBe('page-1');
    expect(pages[0].name).toBe('My Page');
    expect(pages[0].access_token).toBe(REDACTED);
  });

  it('scrubs emails from strings', () => {
    expect(scrubValue('reach me at bob@example.com please')).toBe(`reach me at ${REDACTED_EMAIL} please`);
  });
});

describe('PINO_REDACT_PATHS', () => {
  it('includes snake_case provider token paths', () => {
    for (const path of [
      'access_token',
      '*.access_token',
      'refresh_token',
      '*.refresh_token',
      'id_token',
      '*.id_token',
      'client_secret',
      '*.client_secret',
    ]) {
      expect(PINO_REDACT_PATHS).toContain(path);
    }
  });

  it('censors snake_case provider token fields via Pino redaction', () => {
    const chunks: string[] = [];
    const stream = {
      write: (message: string) => {
        chunks.push(message);
      },
    };
    const logger = pino(
      { redact: { paths: PINO_REDACT_PATHS, censor: REDACTED } },
      stream,
    );

    logger.info({
      access_token: 'provider-access',
      nested: { refresh_token: 'provider-refresh', id_token: 'provider-id' },
      client_secret: 'provider-secret',
      pageCount: 2,
    });

    const parsed = JSON.parse(chunks[0]!) as Record<string, unknown>;
    expect(parsed.access_token).toBe(REDACTED);
    expect(parsed.client_secret).toBe(REDACTED);
    expect(parsed.pageCount).toBe(2);
    const nested = parsed.nested as Record<string, unknown>;
    expect(nested.refresh_token).toBe(REDACTED);
    expect(nested.id_token).toBe(REDACTED);
  });
});
