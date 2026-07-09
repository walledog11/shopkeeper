import { randomBytes } from 'node:crypto';
import { db } from './index.js';

export const ORG_MEMBER_BIND_TOKEN_TTL_SECONDS = 24 * 60 * 60;

// 24 random bytes → 32-char base64url (A–Z, a–z, 0–9, -, _). Used to skip DB
// lookups when inbound operator text is clearly not a connect code (yes, HELP, …).
const BIND_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function looksLikeOrgMemberBindToken(token: string): boolean {
  return BIND_TOKEN_PATTERN.test(token);
}

export interface OrgMemberBindTokenPayload {
  organizationId: string;
  clerkUserId: string;
}

export async function createOrgMemberBindToken(params: {
  organizationId: string;
  clerkUserId: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ORG_MEMBER_BIND_TOKEN_TTL_SECONDS * 1000);

  await db.orgMemberBindToken.create({
    data: {
      token,
      organizationId: params.organizationId,
      clerkUserId: params.clerkUserId,
      expiresAt,
    },
  });

  return { token, expiresInSeconds: ORG_MEMBER_BIND_TOKEN_TTL_SECONDS };
}

export async function findOrgMemberBindToken(
  token: string,
): Promise<OrgMemberBindTokenPayload | null> {
  const row = await db.orgMemberBindToken.findUnique({ where: { token } });
  if (!row) return null;

  if (row.expiresAt <= new Date()) {
    await db.orgMemberBindToken.delete({ where: { token } }).catch(() => undefined);
    return null;
  }

  return {
    organizationId: row.organizationId,
    clerkUserId: row.clerkUserId,
  };
}

export async function deleteOrgMemberBindToken(token: string): Promise<void> {
  await db.orgMemberBindToken.delete({ where: { token } }).catch(() => undefined);
}
