import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { get, put } from '@vercel/blob';
import { auth } from '@clerk/nextjs/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { chatImagePathname, chatImageUrl, MAX_CHAT_IMAGE_BYTES, parseChatImageUrl } from '@/lib/storefront-chat/images';
import { POST } from './route';
import { GET } from '@/app/api/storefront-chat/images/[organizationId]/[imageId]/route';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: vi.fn(), get: vi.fn() }));

let org: Awaited<ReturnType<typeof createTestOrg>>;
let integrationId: string;
function upload(file: File) {
  const body = new FormData();
  body.set('file', file);
  return POST(new Request('http://localhost/api/integrations/shopify/storefront-chat/image', { method: 'POST', body }));
}
function readImage(organizationId: string, imageId: string) {
  return GET(new Request('http://localhost'), { params: Promise.resolve({ organizationId, imageId }) });
}

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: 'user_chat_picture' } });
  vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_picture', orgId: org.clerkOrgId, orgRole: 'org:admin' } as Awaited<ReturnType<typeof auth>>);
  integrationId = (await createTestIntegration(org.id, { platform: ChannelType.shopify })).id;
});
afterEach(async () => { await cleanupTestData(org?.id); vi.resetAllMocks(); });

describe('chat pictures', () => {
  it('normalizes and stores a picture, then serves the same bytes without dashboard authentication', async () => {
    const png = await sharp({ create: { width: 1600, height: 800, channels: 4, background: '#30694e' } }).png().toBuffer();
    const response = await upload(new File([new Uint8Array(png)], 'my-logo.png', { type: 'image/png' }));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    const picture = parseChatImageUrl(url)!;
    expect(picture.organizationId).toBe(org.id);
    const [pathname, content, options] = vi.mocked(put).mock.calls[0];
    expect(pathname).toBe(chatImagePathname(org.id, picture.imageId));
    expect(options).toMatchObject({ access: 'private', contentType: 'image/webp', addRandomSuffix: false });
    const bytes = content as Buffer;
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'webp', width: 512, height: 256 });
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    // Uploading does not change the live configuration before the merchant saves.
    expect((await db.integration.findUniqueOrThrow({ where: { id: integrationId } })).metadata).not.toHaveProperty('storefrontChat.configuration');
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(get).mockResolvedValue({ statusCode: 200, stream: new Response(new Uint8Array(bytes)).body } as Awaited<ReturnType<typeof get>>);
    const publicResponse = await readImage(org.id, picture.imageId);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('content-type')).toBe('image/webp');
    expect(publicResponse.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await publicResponse.arrayBuffer())).toEqual(bytes);
    expect(get).toHaveBeenCalledWith(pathname, { access: 'private' });
  });

  it('rejects oversized, corrupt, and active content disguised as an image', async () => {
    for (const file of [
      new File([new Uint8Array(MAX_CHAT_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' }),
      new File(['not an image'], 'broken.jpg', { type: 'image/jpeg' }),
      new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'], 'fake.png', { type: 'image/png' }),
      new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }),
    ]) expect((await upload(file)).status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('requires a workspace admin and an active Shopify connection', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_picture', orgId: org.clerkOrgId, orgRole: 'org:member' } as Awaited<ReturnType<typeof auth>>);
    expect((await upload(new File(['x'], 'image.png', { type: 'image/png' }))).status).toBe(403);
    vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_picture', orgId: org.clerkOrgId, orgRole: 'org:admin' } as Awaited<ReturnType<typeof auth>>);
    await db.integration.update({ where: { id: integrationId }, data: { lifecycleStatus: 'disconnecting' } });
    expect((await upload(new File(['x'], 'image.png', { type: 'image/png' }))).status).toBe(404);
    expect(put).not.toHaveBeenCalled();
  });

  it('cannot serve ordinary attachments or arbitrary paths', async () => {
    for (const imageId of ['../invoice.pdf', 'avatar.png', randomUUID() + '/../../private']) {
      expect((await readImage(org.id, imageId)).status).toBe(404);
      expect(parseChatImageUrl(chatImageUrl(org.id, imageId))).toBeNull();
    }
    expect((await readImage('../another-org', randomUUID())).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    vi.mocked(get).mockResolvedValue(null);
    expect((await readImage(org.id, randomUUID())).status).toBe(404);
  });
});
