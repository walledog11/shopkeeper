import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db, decryptToken, encryptToken, isEncrypted } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('encryptToken / decryptToken', () => {
  it('round-trips through encrypt/decrypt', () => {
    const cipher = encryptToken('shpat_secret_value');
    expect(cipher).not.toBeNull();
    expect(cipher).not.toBe('shpat_secret_value');
    expect(isEncrypted(cipher!)).toBe(true);
    expect(decryptToken(cipher)).toBe('shpat_secret_value');
  });

  it('returns null for empty/nullish values', () => {
    expect(encryptToken(null)).toBeNull();
    expect(encryptToken('')).toBeNull();
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken('')).toBeNull();
  });

  it('does not double-encrypt', () => {
    const once = encryptToken('abc123');
    const twice = encryptToken(once);
    expect(twice).toBe(once);
  });

  it('passes legacy plaintext through on decrypt', () => {
    expect(decryptToken('legacy_plain_token')).toBe('legacy_plain_token');
  });

  it('produces a different ciphertext on every encryption (random IV)', () => {
    const a = encryptToken('same-plaintext');
    const b = encryptToken('same-plaintext');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('same-plaintext');
    expect(decryptToken(b)).toBe('same-plaintext');
  });
});

describe('Prisma integration extension', () => {
  it('stores tokens encrypted at rest and returns them decrypted', async () => {
    const created = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.shopify,
        externalAccountId: 'shop-1.myshopify.com',
        accessToken: 'shpat_test_access',
        refreshToken: 'shpat_test_refresh',
      },
    });

    expect(created.accessToken).toBe('shpat_test_access');
    expect(created.refreshToken).toBe('shpat_test_refresh');

    const raw = await db.$queryRaw<{ accessToken: string | null; refreshToken: string | null }[]>`
      SELECT access_token AS "accessToken", refresh_token AS "refreshToken"
      FROM integrations WHERE id = ${created.id}::uuid
    `;
    expect(raw).toHaveLength(1);
    expect(isEncrypted(raw[0].accessToken)).toBe(true);
    expect(isEncrypted(raw[0].refreshToken)).toBe(true);
    expect(raw[0].accessToken).not.toContain('shpat_test_access');
    expect(raw[0].refreshToken).not.toContain('shpat_test_refresh');

    const fetched = await db.integration.findUnique({ where: { id: created.id } });
    expect(fetched?.accessToken).toBe('shpat_test_access');
    expect(fetched?.refreshToken).toBe('shpat_test_refresh');

    const fetchedMany = await db.integration.findMany({ where: { organizationId: org.id } });
    expect(fetchedMany[0].accessToken).toBe('shpat_test_access');
  });

  it('re-encrypts on update', async () => {
    const created = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.shopify,
        externalAccountId: 'shop-2.myshopify.com',
        accessToken: 'initial_token',
      },
    });

    await db.integration.update({
      where: { id: created.id },
      data: { accessToken: 'rotated_token' },
    });

    const raw = await db.$queryRaw<{ accessToken: string | null }[]>`
      SELECT access_token AS "accessToken" FROM integrations WHERE id = ${created.id}::uuid
    `;
    expect(isEncrypted(raw[0].accessToken)).toBe(true);
    expect(raw[0].accessToken).not.toContain('rotated_token');

    const fetched = await db.integration.findUnique({ where: { id: created.id } });
    expect(fetched?.accessToken).toBe('rotated_token');
  });

  it('handles null tokens transparently', async () => {
    const created = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: 'support@example.test',
      },
    });

    expect(created.accessToken).toBeNull();
    expect(created.refreshToken).toBeNull();

    const fetched = await db.integration.findUnique({ where: { id: created.id } });
    expect(fetched?.accessToken).toBeNull();
    expect(fetched?.refreshToken).toBeNull();
  });
});
