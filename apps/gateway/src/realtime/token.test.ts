import { createHmac } from 'node:crypto';
// Deterministic realtime token unit coverage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyRealtimeToken } from './token.js';

const SECRET = 'test-internal-secret';

function mint(payload: { orgId: string; exp: number }, secret = SECRET): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verifyRealtimeToken', () => {
  it('returns the orgId for a valid, unexpired token', () => {
    const token = mint({ orgId: 'org_123', exp: Date.now() + 60_000 });
    expect(verifyRealtimeToken(token)).toBe('org_123');
  });

  it('rejects an expired token', () => {
    const token = mint({ orgId: 'org_123', exp: Date.now() - 1 });
    expect(verifyRealtimeToken(token)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = mint({ orgId: 'org_123', exp: Date.now() + 60_000 }, 'wrong-secret');
    expect(verifyRealtimeToken(token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = mint({ orgId: 'org_123', exp: Date.now() + 60_000 });
    const forged = Buffer.from(JSON.stringify({ orgId: 'org_evil', exp: Date.now() + 60_000 })).toString('base64url');
    expect(verifyRealtimeToken(`${forged}.${token.split('.')[1]}`)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyRealtimeToken(undefined)).toBeNull();
    expect(verifyRealtimeToken('')).toBeNull();
    expect(verifyRealtimeToken('no-dot')).toBeNull();
    expect(verifyRealtimeToken('.sig')).toBeNull();
  });
});
