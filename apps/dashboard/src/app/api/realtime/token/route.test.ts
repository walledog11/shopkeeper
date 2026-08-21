import { createHmac, timingSafeEqual } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { GET } from './route';

const SECRET = 'test-internal-secret';

// A deliberate second implementation of apps/gateway/src/realtime/token.ts.
// The gateway's own unit test mints its tokens locally, so neither side
// currently notices if the dashboard's minter drifts from the wire format.
// Verifying here with the gateway's algorithm is what closes that gap.
function verifyLikeGateway(token: string, secret = SECRET): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(encoded).digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  let payload: { orgId?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.orgId !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Date.now()) return null;

  return payload.orgId;
}

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_realtime', orgId: org.clerkOrgId });
  vi.stubEnv('INTERNAL_API_SECRET', SECRET);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GET /api/realtime/token', () => {
  it('mints a token the gateway verifier accepts, scoped to the calling org', async () => {
    const response = await GET();
    const body = (await response.json()) as { token: string; expiresAt: number };

    expect(response.status).toBe(200);
    expect(verifyLikeGateway(body.token)).toBe(org!.id);
  });

  it('reports an expiry that matches the one signed into the token', async () => {
    const response = await GET();
    const body = (await response.json()) as { token: string; expiresAt: number };

    const encoded = body.token.slice(0, body.token.indexOf('.'));
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    // A client that trusts `expiresAt` to schedule its refresh must not be told
    // one deadline while the gateway enforces another.
    expect(payload.exp).toBe(body.expiresAt);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('carries no payload beyond the org binding and the expiry', async () => {
    const response = await GET();
    const body = (await response.json()) as { token: string };

    const encoded = body.token.slice(0, body.token.indexOf('.'));
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    // The token travels as an EventSource query param, so it lands in browser
    // history and any proxy log in front of the gateway. It grants a
    // subscription; it must never become a carrier for org data.
    expect(Object.keys(payload).sort()).toEqual(['exp', 'orgId']);
  });

  it('is rejected by the verifier once tampered with', async () => {
    const response = await GET();
    const { token } = (await response.json()) as { token: string };

    const forgedPayload = Buffer.from(
      JSON.stringify({ orgId: 'org_someone_else', exp: Date.now() + 60_000 }),
    ).toString('base64url');

    expect(verifyLikeGateway(`${forgedPayload}.${token.split('.')[1]}`)).toBeNull();
  });

  it('is rejected by a gateway holding a different shared secret', async () => {
    const response = await GET();
    const { token } = (await response.json()) as { token: string };

    expect(verifyLikeGateway(token, 'a-different-internal-secret')).toBeNull();
  });

  it('fails closed with 503 when the shared secret is not configured', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');

    const response = await GET();

    // Minting an unsigned or blank-keyed token would be worse than refusing.
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('never returns another org a token bound to this one', async () => {
    const otherOrg = await createTestOrg();
    try {
      mockAuth.mockResolvedValue({ userId: 'usr_other', orgId: otherOrg.clerkOrgId });

      const response = await GET();
      const { token } = (await response.json()) as { token: string };

      expect(verifyLikeGateway(token)).toBe(otherOrg.id);
      expect(verifyLikeGateway(token)).not.toBe(org!.id);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});
