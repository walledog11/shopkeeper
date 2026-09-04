import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { formatBlobAttachmentRef } from '@/lib/attachments/blob-ref';

const { getSpy, putSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  putSpy: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  get: getSpy,
  put: putSpy,
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

import { GET, POST } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as Awaited<ReturnType<typeof auth>>);
  getSpy.mockReset();
  putSpy.mockReset();
  putSpy.mockResolvedValue({});
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
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="photo.png"');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.text()).toBe('hello');
    expect(getSpy).toHaveBeenCalledWith(pathname, { access: 'private' });
  });

  it.each([
    ['page.html', 'text/html', 'text/html'],
    ['vector.svg', 'image/svg+xml', 'image/svg+xml'],
    ['photo.png', 'text/html', 'text/html'],
    ['page.html', 'image/png', 'image/png'],
    ['report.pdf', 'application/pdf; charset=binary', 'application/pdf'],
    ['unknown.bin', 'not a media type', 'application/octet-stream'],
  ])(
    'forces %s with declared type %s to download as %s',
    async (filename, declaredContentType, expectedContentType) => {
      const pathname = `attachments/${org.id}/file-id/${filename}`;
      const ref = formatBlobAttachmentRef(pathname);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('attachment'));
          controller.close();
        },
      });
      getSpy.mockResolvedValueOnce({
        statusCode: 200,
        stream,
        blob: { contentType: declaredContentType },
      });

      const res = await GET(new Request(
        `http://localhost:3000/api/attachments?ref=${encodeURIComponent(ref)}`,
      ));

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe(expectedContentType);
      expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="${filename}"`);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    },
  );

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

function uploadRequest(file: File): Request {
  const body = new FormData();
  body.append('file', file);
  return new Request('http://localhost:3000/api/attachments', { method: 'POST', body });
}

describe('POST /api/attachments', () => {
  it('stores a file under the caller org and returns its ref', async () => {
    const res = await POST(uploadRequest(
      new File(['receipt bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    ));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.name).toBe('receipt.pdf');
    expect(payload.contentType).toBe('application/pdf');
    expect(payload.ref).toMatch(new RegExp(`^blob:attachments/${org.id}/[0-9a-f-]+/receipt\\.pdf$`));

    expect(putSpy).toHaveBeenCalledTimes(1);
    const [pathname, buffer, options] = putSpy.mock.calls[0];
    expect(pathname.startsWith(`attachments/${org.id}/`)).toBe(true);
    expect(Buffer.from(buffer).toString()).toBe('receipt bytes');
    expect(options).toMatchObject({ access: 'private', contentType: 'application/pdf' });
  });

  it('sanitizes a filename that would break the pathname', async () => {
    const res = await POST(uploadRequest(
      new File(['x'], '../../etc/pass wd.txt', { type: 'text/plain' }),
    ));

    expect(res.status).toBe(200);
    const payload = await res.json();
    // The separators are what make traversal possible, so they are the thing
    // that must not survive; the dots are inert once no slash follows them.
    expect(payload.name).toBe('.._.._etc_pass_wd.txt');
    expect(payload.ref).toBe(`blob:${putSpy.mock.calls[0][0]}`);
    expect(putSpy.mock.calls[0][0]).toBe(`attachments/${org.id}/${payload.ref.split('/')[2]}/${payload.name}`);
  });

  it.each([
    ['payload.exe', 'application/octet-stream'],
    ['script.sh', 'text/plain'],
    ['macro.js', 'text/plain'],
    ['safe.txt', 'text/x-shellscript'],
  ])('refuses executable %s before writing anything', async (filename, contentType) => {
    const res = await POST(uploadRequest(new File(['x'], filename, { type: contentType })));

    expect(res.status).toBe(400);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('refuses a file over the per-file ceiling', async () => {
    const oversized = new File(
      [new Uint8Array(8 * 1024 * 1024)],
      'huge.pdf',
      { type: 'application/pdf' },
    );

    const res = await POST(uploadRequest(oversized));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('too large') });
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('refuses an empty file', async () => {
    const res = await POST(uploadRequest(new File([], 'empty.pdf', { type: 'application/pdf' })));

    expect(res.status).toBe(400);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is present', async () => {
    const res = await POST(new Request('http://localhost:3000/api/attachments', {
      method: 'POST',
      body: new FormData(),
    }));

    expect(res.status).toBe(400);
    expect(putSpy).not.toHaveBeenCalled();
  });
});
