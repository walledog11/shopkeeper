import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { POST as createArticle } from './[id]/articles/route';
import { POST as createBase } from './route';
import { PATCH as patchArticle } from '../[id]/route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_kb', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe('/api/kb/bases write routes', () => {
  it('rejects invalid knowledge-base creates without persisting', async () => {
    const res = await createBase(jsonRequest('http://localhost/api/kb/bases', { name: '   ' }));

    expect(res.status).toBe(400);
    await expect(db.knowledgeBase.count({ where: { organizationId: org!.id } })).resolves.toBe(0);
  });

  it('creates trimmed user knowledge bases scoped to the active org', async () => {
    const res = await createBase(jsonRequest('http://localhost/api/kb/bases', { name: '  Returns ' }));
    const body = await res.json() as { knowledgeBase: { id: string; name: string; source: string } };

    expect(res.status).toBe(201);
    expect(body.knowledgeBase).toMatchObject({ name: 'Returns', source: 'user' });

    const saved = await db.knowledgeBase.findUniqueOrThrow({ where: { id: body.knowledgeBase.id } });
    expect(saved.organizationId).toBe(org!.id);
  });

  it('rejects invalid article creates without persisting', async () => {
    const kb = await createUserKnowledgeBase();

    const res = await createArticle(
      jsonRequest(`http://localhost/api/kb/bases/${kb.id}/articles`, { title: 'Valid', body: '   ' }),
      params(kb.id),
    );

    expect(res.status).toBe(400);
    await expect(db.kbArticle.count({ where: { knowledgeBaseId: kb.id } })).resolves.toBe(0);
  });

  it('does not create articles inside synced knowledge bases', async () => {
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org!.id, name: 'Shopify', source: 'shopify' },
    });

    const res = await createArticle(
      jsonRequest(`http://localhost/api/kb/bases/${kb.id}/articles`, { title: 'Policy', body: 'Synced' }),
      params(kb.id),
    );

    expect(res.status).toBe(403);
    await expect(db.kbArticle.count({ where: { knowledgeBaseId: kb.id } })).resolves.toBe(0);
  });

  it('creates normalized articles in user knowledge bases', async () => {
    const kb = await createUserKnowledgeBase();

    const res = await createArticle(
      jsonRequest(`http://localhost/api/kb/bases/${kb.id}/articles`, {
        title: ' Shipping ',
        body: ' Ships fast ',
        tags: [' policy ', 5, ''],
      }),
      params(kb.id),
    );
    const body = await res.json() as { article: { id: string; title: string; body: string; tags: string[] } };

    expect(res.status).toBe(201);
    expect(body.article).toMatchObject({
      title: 'Shipping',
      body: 'Ships fast',
      tags: ['policy'],
    });
  });

  it('rejects invalid article updates without mutating', async () => {
    const article = await createUserArticle();

    const res = await patchArticle(
      jsonRequest(`http://localhost/api/kb/${article.id}`, { tags: 'policy' }, 'PATCH'),
      params(article.id),
    );

    expect(res.status).toBe(400);
    const unchanged = await db.kbArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(unchanged.tags).toEqual(['faq']);
  });

  it('does not update synced articles', async () => {
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org!.id, name: 'Shopify', source: 'shopify' },
    });
    const article = await db.kbArticle.create({
      data: { organizationId: org!.id, knowledgeBaseId: kb.id, title: 'Policy', body: 'Synced', tags: [] },
    });

    const res = await patchArticle(
      jsonRequest(`http://localhost/api/kb/${article.id}`, { title: 'Changed' }, 'PATCH'),
      params(article.id),
    );

    expect(res.status).toBe(403);
    const unchanged = await db.kbArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(unchanged.title).toBe('Policy');
  });
});

async function createUserKnowledgeBase() {
  return db.knowledgeBase.create({
    data: { organizationId: org!.id, name: 'Support KB', source: 'user' },
  });
}

async function createUserArticle() {
  const kb = await createUserKnowledgeBase();
  return db.kbArticle.create({
    data: {
      organizationId: org!.id,
      knowledgeBaseId: kb.id,
      title: 'FAQ',
      body: 'Answer',
      tags: ['faq'],
    },
  });
}

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
