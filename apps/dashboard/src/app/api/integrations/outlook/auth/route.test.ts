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
import { GET } from './route';

beforeEach(() => {
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'ms-client-id');
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: 'org_oauth',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockCookieSet.mockClear();
});

describe('GET /api/integrations/outlook/auth', () => {
  it('requests send and identity scopes without read/write mail scope', async () => {
    const res = await GET(new Request('http://localhost/api/integrations/outlook/auth?returnTo=/dashboard/integrations'));

    expect(res.status).toBe(307);
    const redirectUrl = new URL(res.headers.get('location')!);
    expect(redirectUrl.origin).toBe('https://login.microsoftonline.com');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe('http://dashboard.test/api/integrations/outlook/callback');
    const scopes = redirectUrl.searchParams.get('scope')!.split(' ');
    expect(scopes).toEqual(expect.arrayContaining(['openid', 'email', 'offline_access', 'User.Read', 'Mail.Send']));
    expect(scopes).not.toContain('Mail.ReadWrite');
    expect(scopes).not.toContain('https://graph.microsoft.com/Mail.ReadWrite');

    expect(mockCookieSet).toHaveBeenCalledWith('outlook_oauth_return', '/dashboard/integrations', expect.any(Object));
  });
});
