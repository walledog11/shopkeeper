import { describe, it, expect, beforeEach, vi } from 'vitest';

const { putSpy } = vi.hoisted(() => ({
  putSpy: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: putSpy,
}));

import { uploadInboundAttachment } from './blob.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  putSpy.mockReset();
  putSpy.mockResolvedValue({ url: 'https://blob.vercel-storage.com/test' });
});

describe('uploadInboundAttachment', () => {
  it('uploads a normal attachment and returns a private blob ref', async () => {
    const ref = await uploadInboundAttachment(
      ORG_ID,
      'photo.png',
      'image/png',
      Buffer.from('hello').toString('base64'),
    );
    expect(ref).toMatch(new RegExp(`^blob:attachments/${ORG_ID}/[0-9a-f-]+/photo.png$`));
    expect(putSpy).toHaveBeenCalledOnce();
    const [pathname, body, opts] = putSpy.mock.calls[0];
    expect(pathname).toMatch(new RegExp(`^attachments/${ORG_ID}/[0-9a-f-]+/photo.png$`));
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(opts).toMatchObject({ access: 'private', contentType: 'image/png' });
  });

  it('skips attachments larger than 10 MB', async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    const url = await uploadInboundAttachment(ORG_ID, 'big.bin', 'application/octet-stream', oversized);
    expect(url).toBeNull();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['evil.exe', 'application/octet-stream'],
    ['script.bat', 'application/octet-stream'],
    ['payload.scr', 'application/octet-stream'],
    ['x.cmd', 'application/octet-stream'],
    ['installer.msi', 'application/octet-stream'],
    ['legacy.com', 'application/octet-stream'],
    ['macro.vbs', 'application/octet-stream'],
    ['exploit.js', 'application/javascript'],
    ['runme.jar', 'application/java-archive'],
    ['something', 'application/x-msdownload'],
    ['evil.exe.txt', 'text/plain'],
    ['photo.jpg.scr', 'image/jpeg'],
  ])('skips blocked attachment %s (%s)', async (name, contentType) => {
    const url = await uploadInboundAttachment(
      ORG_ID,
      name,
      contentType,
      Buffer.from('x').toString('base64'),
    );
    expect(url).toBeNull();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('skips empty attachments', async () => {
    const url = await uploadInboundAttachment(ORG_ID, 'empty.png', 'image/png', '');
    expect(url).toBeNull();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('returns null when the upload throws', async () => {
    putSpy.mockRejectedValueOnce(new Error('network down'));
    const url = await uploadInboundAttachment(
      ORG_ID,
      'photo.png',
      'image/png',
      Buffer.from('hello').toString('base64'),
    );
    expect(url).toBeNull();
  });

  it('sanitizes filenames with unsafe characters', async () => {
    await uploadInboundAttachment(
      ORG_ID,
      'invoice 2026/04 (final).pdf',
      'application/pdf',
      Buffer.from('hello').toString('base64'),
    );
    const [key] = putSpy.mock.calls[0];
    // Assert on the filename segment only; the full key contains a random UUID
    // segment that can itself start with "04" and trip a whole-key substring check.
    expect(key.split('/').pop()).toBe('invoice_2026_04_final_.pdf');
  });
});
