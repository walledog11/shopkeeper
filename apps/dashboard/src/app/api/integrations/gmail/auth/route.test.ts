import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCookieSet } = vi.hoisted(() => ({
  mockCookieSet: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: mockCookieSet,
  })),
}));

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: 'org_oauth',
    orgRole: 'org:admin',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockCookieSet.mockClear();
});

describe('POST /api/integrations/gmail/auth', () => {
  it('requests Gmail send and read scopes', async () => {
    const res = await POST(new Request('http://localhost/api/integrations/gmail/auth?returnTo=/dashboard/integrations'));

    expect(res.status).toBe(303);
    const redirectUrl = new URL(res.headers.get('location')!);
    expect(redirectUrl.origin).toBe('https://accounts.google.com');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe('http://dashboard.test/api/integrations/gmail/callback');
    const scopes = redirectUrl.searchParams.get('scope')!.split(' ');
    expect(scopes).toEqual(expect.arrayContaining([
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ]));
    expect(scopes).not.toContain('https://www.googleapis.com/auth/gmail.modify');

    const state = redirectUrl.searchParams.get('state');
    expect(mockCookieSet).toHaveBeenCalledWith(
      `gmail_oauth_attempt_${state}`,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 600 }),
    );
    const attempt = JSON.parse(Buffer.from(mockCookieSet.mock.calls[0][1], 'base64url').toString());
    expect(attempt).toMatchObject({
      userId: 'usr_oauth',
      orgId: 'org_oauth',
      mode: 'redirect',
      returnTo: '/dashboard/integrations',
    });
  });
});
