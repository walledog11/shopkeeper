import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { formatBlobAttachmentRef } from '@/lib/attachments/blob-ref';

const { getSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  get: getSpy,
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

import { GET } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as Awaited<ReturnType<typeof auth>>);
  getSpy.mockReset();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('GET /api/attachments', () => {
  it('streams a private attachment for the current org', async () => {
    const pathname = `attachments/${org.id}/file-id/photo.png`;
    const ref = formatBlobAttachmentRef(pathname);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'));
        controller.close();
      },
    });

    getSpy.mockResolvedValueOnce({
      statusCode: 200,
      stream,
      blob: { contentType: 'image/png' },
    });

    const res = await GET(new Request(`http://localhost:3000/api/attachments?ref=${encodeURIComponent(ref)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(await res.text()).toBe('hello');
    expect(getSpy).toHaveBeenCalledWith(pathname, { access: 'private' });
  });

  it('returns 404 for another org attachment ref', async () => {
    const otherOrgId = '00000000-0000-0000-0000-000000000099';
    const ref = formatBlobAttachmentRef(`attachments/${otherOrgId}/file-id/photo.png`);

    const res = await GET(new Request(`http://localhost:3000/api/attachments?ref=${encodeURIComponent(ref)}`));
    expect(res.status).toBe(404);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when ref is missing', async () => {
    const res = await GET(new Request('http://localhost:3000/api/attachments'));
    expect(res.status).toBe(400);
  });

  it('falls back to public blob access for legacy attachments', async () => {
    const pathname = `attachments/${org.id}/file-id/report.pdf`;
    const legacyUrl = `https://abc123.public.blob.vercel-storage.com/${pathname}`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('pdf'));
        controller.close();
      },
    });

    getSpy
      .mockResolvedValueOnce({ statusCode: 404, stream: null, blob: {} })
      .mockResolvedValueOnce({
        statusCode: 200,
        stream,
        blob: { contentType: 'application/pdf' },
      });

    const res = await GET(new Request(`http://localhost:3000/api/attachments?ref=${encodeURIComponent(legacyUrl)}`));
    expect(res.status).toBe(200);
    expect(getSpy).toHaveBeenNthCalledWith(1, pathname, { access: 'private' });
    expect(getSpy).toHaveBeenNthCalledWith(2, pathname, { access: 'public' });
  });
});
