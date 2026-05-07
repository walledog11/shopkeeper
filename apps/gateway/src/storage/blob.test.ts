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
  it('uploads a normal attachment and returns the public URL', async () => {
    const url = await uploadInboundAttachment(
      ORG_ID,
      'photo.png',
      'image/png',
      Buffer.from('hello').toString('base64'),
    );
    expect(url).toBe('https://blob.vercel-storage.com/test');
    expect(putSpy).toHaveBeenCalledOnce();
    const [key, body, opts] = putSpy.mock.calls[0];
    expect(key).toMatch(new RegExp(`^attachments/${ORG_ID}/[0-9a-f-]+/photo.png$`));
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(opts).toMatchObject({ access: 'public', contentType: 'image/png' });
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
    expect(key).not.toContain(' ');
    expect(key).not.toContain('/04');
    expect(key).not.toContain('(');
  });
});
