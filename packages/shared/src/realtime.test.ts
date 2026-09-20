import { describe, expect, it } from 'vitest';
import { mintRealtimeToken, verifyRealtimeToken } from './realtime.js';

const SECRET = 'test-internal-secret';

describe('realtime token round-trip', () => {
  it('mints a token the verifier accepts', () => {
    const { token, expiresAt } = mintRealtimeToken('org_123', SECRET);
    expect(verifyRealtimeToken(token, SECRET)).toBe('org_123');
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects wrong secret, expiry, and malformed input', () => {
    const { token } = mintRealtimeToken('org_123', SECRET);
    expect(verifyRealtimeToken(token, 'wrong')).toBeNull();
    expect(verifyRealtimeToken(undefined, SECRET)).toBeNull();
    expect(verifyRealtimeToken('no-dot', SECRET)).toBeNull();

    const encoded = token.split('.')[0];
    const expired = `${encoded}.${token.split('.')[1]}`;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const forgedEncoded = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() - 1 })).toString(
      'base64url',
    );
    expect(verifyRealtimeToken(`${forgedEncoded}.${expired.split('.')[1]}`, SECRET)).toBeNull();
  });

  it('honors a custom TTL', () => {
    const { expiresAt } = mintRealtimeToken('org_123', SECRET, 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
