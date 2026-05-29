/**
 * Org-scoping regression guard.
 *
 * Every authenticated route that takes a resource id must reject ids that
 * belong to a different org with 404. If a new id-style route is added,
 * extend the cases below so the suite fails until the route is scoped.
 *
 * Routes already covered by their own per-route tests (and intentionally
 * not duplicated here): /api/messages, /api/threads, /api/threads/[id],
 * /api/agent/plan.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestIntegration,
  cleanupTestData,
} from '@clerk/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import {
  PATCH as patchCannedResponse,
  DELETE as deleteCannedResponse,
} from '@/app/api/canned-responses/[id]/route';
import { POST as duplicateCannedResponse } from '@/app/api/canned-responses/[id]/duplicate/route';
import { POST as useCannedResponse } from '@/app/api/canned-responses/[id]/use/route';
import {
  PATCH as patchKbArticle,
  DELETE as deleteKbArticle,
} from '@/app/api/kb/[id]/route';
import { DELETE as deleteKbBase } from '@/app/api/kb/bases/[id]/route';
import { POST as createKbArticle } from '@/app/api/kb/bases/[id]/articles/route';
import {
  PATCH as patchPlaybook,
  DELETE as deletePlaybook,
} from '@/app/api/playbooks/[id]/route';
import { DELETE as deleteIntegration } from '@/app/api/integrations/[id]/route';
import { POST as aiSummary } from '@/app/api/ai/summary/route';

let callerOrg!: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg!: Awaited<ReturnType<typeof createTestOrg>>;

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const jsonReq = (url: string, body: unknown, method = 'POST') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  callerOrg = await createTestOrg();
  otherOrg = await createTestOrg();
  vi.mocked(auth).mockResolvedValue(
    { userId: 'usr_test', orgId: callerOrg.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
});

afterEach(async () => {
  await cleanupTestData(callerOrg?.id);
  await cleanupTestData(otherOrg?.id);
  vi.clearAllMocks();
});

describe('cross-org isolation , id-style routes return 404 for foreign resources', () => {
  it('PATCH /api/canned-responses/[id] returns 404 for another org id', async () => {
    const foreign = await db.cannedResponse.create({
      data: { organizationId: otherOrg.id, title: 't', body: 'b', tags: [], channels: [] },
    });
    const res = await patchCannedResponse(
      jsonReq(`http://x/api/canned-responses/${foreign.id}`, { title: 'hax' }, 'PATCH'),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const unchanged = await db.cannedResponse.findUnique({ where: { id: foreign.id } });
    expect(unchanged?.title).toBe('t');
  });

  it('DELETE /api/canned-responses/[id] returns 404 for another org id', async () => {
    const foreign = await db.cannedResponse.create({
      data: { organizationId: otherOrg.id, title: 't', body: 'b', tags: [], channels: [] },
    });
    const res = await deleteCannedResponse(
      new Request(`http://x/api/canned-responses/${foreign.id}`, { method: 'DELETE' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const stillThere = await db.cannedResponse.findUnique({ where: { id: foreign.id } });
    expect(stillThere).not.toBeNull();
  });

  it('POST /api/canned-responses/[id]/duplicate returns 404 for another org id', async () => {
    const foreign = await db.cannedResponse.create({
      data: { organizationId: otherOrg.id, title: 't', body: 'b', tags: [], channels: [] },
    });
    const res = await duplicateCannedResponse(
      new Request(`http://x/api/canned-responses/${foreign.id}/duplicate`, { method: 'POST' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const callerCount = await db.cannedResponse.count({ where: { organizationId: callerOrg.id } });
    expect(callerCount).toBe(0);
  });

  it('POST /api/canned-responses/[id]/use returns 404 for another org id', async () => {
    const foreign = await db.cannedResponse.create({
      data: { organizationId: otherOrg.id, title: 't', body: 'b', tags: [], channels: [] },
    });
    const res = await useCannedResponse(
      new Request(`http://x/api/canned-responses/${foreign.id}/use`, { method: 'POST' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);
  });

  it('PATCH /api/kb/[id] returns 404 for another org article id', async () => {
    const foreignKb = await db.knowledgeBase.create({
      data: { organizationId: otherOrg.id, name: 'Other', source: 'user' },
    });
    const foreignArticle = await db.kbArticle.create({
      data: { organizationId: otherOrg.id, knowledgeBaseId: foreignKb.id, title: 't', body: 'b', tags: [] },
    });
    const res = await patchKbArticle(
      jsonReq(`http://x/api/kb/${foreignArticle.id}`, { title: 'hax' }, 'PATCH'),
      params(foreignArticle.id),
    );
    expect(res.status).toBe(404);

    const unchanged = await db.kbArticle.findUnique({ where: { id: foreignArticle.id } });
    expect(unchanged?.title).toBe('t');
  });

  it('DELETE /api/kb/[id] returns 404 for another org article id', async () => {
    const foreignKb = await db.knowledgeBase.create({
      data: { organizationId: otherOrg.id, name: 'Other', source: 'user' },
    });
    const foreignArticle = await db.kbArticle.create({
      data: { organizationId: otherOrg.id, knowledgeBaseId: foreignKb.id, title: 't', body: 'b', tags: [] },
    });
    const res = await deleteKbArticle(
      new Request(`http://x/api/kb/${foreignArticle.id}`, { method: 'DELETE' }),
      params(foreignArticle.id),
    );
    expect(res.status).toBe(404);

    const stillThere = await db.kbArticle.findUnique({ where: { id: foreignArticle.id } });
    expect(stillThere).not.toBeNull();
  });

  it('DELETE /api/kb/bases/[id] returns 404 for another org base id', async () => {
    const foreignKb = await db.knowledgeBase.create({
      data: { organizationId: otherOrg.id, name: 'Other', source: 'user' },
    });
    const res = await deleteKbBase(
      new Request(`http://x/api/kb/bases/${foreignKb.id}`, { method: 'DELETE' }),
      params(foreignKb.id),
    );
    expect(res.status).toBe(404);

    const stillThere = await db.knowledgeBase.findUnique({ where: { id: foreignKb.id } });
    expect(stillThere).not.toBeNull();
  });

  it('POST /api/kb/bases/[id]/articles returns 404 for another org base id', async () => {
    const foreignKb = await db.knowledgeBase.create({
      data: { organizationId: otherOrg.id, name: 'Other', source: 'user' },
    });
    const res = await createKbArticle(
      jsonReq(
        `http://x/api/kb/bases/${foreignKb.id}/articles`,
        { title: 'planted', body: 'planted' },
      ),
      params(foreignKb.id),
    );
    expect(res.status).toBe(404);

    const articleCount = await db.kbArticle.count({ where: { knowledgeBaseId: foreignKb.id } });
    expect(articleCount).toBe(0);
  });

  it('PATCH /api/playbooks/[id] returns 404 for another org playbook id', async () => {
    const foreign = await db.playbook.create({
      data: {
        organizationId: otherOrg.id,
        name: 'pb',
        enabled: true,
        trigger: { type: 'tag', tag: 'x' },
        actions: [],
      },
    });
    const res = await patchPlaybook(
      jsonReq(`http://x/api/playbooks/${foreign.id}`, { enabled: false }, 'PATCH'),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const unchanged = await db.playbook.findUnique({ where: { id: foreign.id } });
    expect(unchanged?.enabled).toBe(true);
  });

  it('DELETE /api/playbooks/[id] returns 404 for another org playbook id', async () => {
    const foreign = await db.playbook.create({
      data: {
        organizationId: otherOrg.id,
        name: 'pb',
        enabled: true,
        trigger: { type: 'tag', tag: 'x' },
        actions: [],
      },
    });
    const res = await deletePlaybook(
      new Request(`http://x/api/playbooks/${foreign.id}`, { method: 'DELETE' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const stillThere = await db.playbook.findUnique({ where: { id: foreign.id } });
    expect(stillThere).not.toBeNull();
  });

  it('DELETE /api/integrations/[id] returns 404 for another org integration id', async () => {
    const foreign = await createTestIntegration(otherOrg.id, { platform: ChannelType.email });
    const res = await deleteIntegration(
      new Request(`http://x/api/integrations/${foreign.id}`, { method: 'DELETE' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);

    const stillThere = await db.integration.findUnique({ where: { id: foreign.id } });
    expect(stillThere).not.toBeNull();
  });

  it('POST /api/ai/summary returns 404 for another org thread id', async () => {
    const foreignCustomer = await createTestCustomer(otherOrg.id, 'foreign@test.com');
    const foreignThread = await createTestThread(otherOrg.id, foreignCustomer.id, ChannelType.email);

    const res = await aiSummary(
      jsonReq('http://x/api/ai/summary', { threadId: foreignThread.id }),
    );
    expect(res.status).toBe(404);

    const unchanged = await db.thread.findUnique({ where: { id: foreignThread.id } });
    expect(unchanged?.aiSummary).toBeNull();
  });
});
