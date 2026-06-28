import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getOrg, logger, postRedirect, upsert } = vi.hoisted(() => ({
  getOrg: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  postRedirect: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/server/org', () => ({ getOrCreateOrg: getOrg }));
vi.mock('@/lib/server/logger', () => ({ default: logger }));
vi.mock('@/lib/server/post-redirect-response', () => ({
  createPostRedirectResponse: postRedirect,
}));
vi.mock('@/app/api/integrations/_lib/integration-upsert', () => ({
  upsertRaceSafeIntegration: upsert,
}));

import { GET, POST } from './route';

describe('/api/integrations/instagram/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://dashboard.test');
    vi.stubEnv('META_PAGE_ACCESS_TOKEN', 'page-token');
    vi.stubEnv('META_INSTAGRAM_ACCOUNT_ID', 'ig-123');
    getOrg.mockResolvedValue({ id: 'org-1' });
    upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses a POST redirect response for browser GET requests', async () => {
    postRedirect.mockReturnValue(new Response(null, { status: 200 }));
    const request = new Request('http://localhost/api/integrations/instagram/connect');

    await GET(request);

    expect(postRedirect).toHaveBeenCalledWith(request, 'Connect Instagram');
  });

  it('is unavailable outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await POST();

    expect(response.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('validates required local-development credentials', async () => {
    vi.stubEnv('META_PAGE_ACCESS_TOKEN', '');

    const response = await POST();

    expect(response.status).toBe(500);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('persists the scoped Instagram connection and redirects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ username: 'fixture_shop' })),
    ));

    const response = await POST();

    expect(upsert).toHaveBeenCalledWith({
      organizationId: 'org-1',
      platform: 'ig_dm',
      externalAccountId: 'ig-123',
      data: { accessToken: 'page-token', fromEmail: 'fixture_shop' },
    });
    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?connected=instagram',
    );
  });
});
