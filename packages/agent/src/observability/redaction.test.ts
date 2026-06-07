import { describe, it, expect } from 'vitest';
import { sentryBeforeSend, REDACTED, REDACTED_EMAIL } from './redaction.js';

function baseEvent() {
  return { type: undefined };
}

describe('sentryBeforeSend', () => {
  it('strips request body and cookies and redacts auth headers', () => {
    const event = baseEvent();
    event.request = {
      data: { password: 'plaintext', email: 'alice@example.com' },
      cookies: { session: 'abc' },
      headers: {
        Authorization: 'Bearer secret-token',
        'x-shopify-access-token': 'shpat_xxx',
        'content-type': 'application/json',
      },
      query_string: 'email=alice@example.com&debug=1',
    };
    const out = sentryBeforeSend(event)!;
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    const headers = out.request!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(REDACTED);
    expect(headers['x-shopify-access-token']).toBe(REDACTED);
    expect(headers['content-type']).toBe('application/json');
    expect(out.request?.query_string).toBe(`email=${REDACTED_EMAIL}&debug=1`);
  });

  it('redacts sensitive keys in extra and scrubs emails in strings', () => {
    const event = baseEvent();
    event.extra = {
      accessToken: 'shpat_xxx',
      refreshToken: 'rt_xxx',
      orgId: 'org_123',
      lastMessage: 'reach me at bob@example.com please',
      payload: { secret: 'nope', nested: { token: 'tk', label: 'ok' } },
    };
    const out = sentryBeforeSend(event)!;
    expect(out.extra!.accessToken).toBe(REDACTED);
    expect(out.extra!.refreshToken).toBe(REDACTED);
    expect(out.extra!.orgId).toBe('org_123');
    expect(out.extra!.lastMessage).toBe(REDACTED);
    const payload = out.extra!.payload as Record<string, unknown>;
    expect(payload.secret).toBe(REDACTED);
    const nested = payload.nested as Record<string, unknown>;
    expect(nested.token).toBe(REDACTED);
    expect(nested.label).toBe('ok');
  });

  it('scrubs emails from message, exception values, and breadcrumb data', () => {
    const event = baseEvent();
    event.message = 'failed for user@example.com';
    event.exception = { values: [{ type: 'Error', value: 'lookup failed for foo@bar.com' }] };
    event.breadcrumbs = [
      { message: 'request from carol@example.com', data: { url: 'https://x/?email=carol@example.com' } },
    ];
    const out = sentryBeforeSend(event)!;
    expect(out.message).toBe(`failed for ${REDACTED_EMAIL}`);
    expect(out.exception?.values?.[0]?.value).toBe(`lookup failed for ${REDACTED_EMAIL}`);
    expect(out.breadcrumbs?.[0]?.message).toBe(`request from ${REDACTED_EMAIL}`);
    const data = out.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(data.url).toBe(`https://x/?email=${REDACTED_EMAIL}`);
  });

  it('redacts user email', () => {
    const event = baseEvent();
    event.user = { id: 'u1', email: 'dave@example.com' };
    const out = sentryBeforeSend(event)!;
    expect(out.user?.email).toBe(REDACTED_EMAIL);
    expect(out.user?.id).toBe('u1');
  });
});
