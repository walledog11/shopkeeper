import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }));
vi.mock('@vercel/blob', () => ({ get: getSpy }));

import {
  getOutboundAttachmentLimits,
  loadOutboundAttachments,
  OutboundAttachmentError,
} from './attachment-load.js';

const LIMITS = { maxCount: 5, maxTotalBytes: 1024 };

function blobOf(content: string, contentType = 'application/pdf') {
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content));
        controller.close();
      },
    }),
    blob: { contentType },
  };
}

beforeEach(() => {
  getSpy.mockReset();
});

describe('loadOutboundAttachments', () => {
  it('returns nothing without touching storage when there are no refs', async () => {
    expect(await loadOutboundAttachments([], LIMITS)).toEqual([]);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('resolves refs to the base64 payload the senders take', async () => {
    getSpy.mockResolvedValueOnce(blobOf('receipt'));

    const loaded = await loadOutboundAttachments(['blob:attachments/org-1/id/receipt.pdf'], LIMITS);

    expect(loaded).toEqual([{
      name: 'receipt.pdf',
      contentType: 'application/pdf',
      contentBase64: Buffer.from('receipt').toString('base64'),
    }]);
    expect(getSpy).toHaveBeenCalledWith(
      'attachments/org-1/id/receipt.pdf',
      expect.objectContaining({ access: 'private' }),
    );
  });

  it('falls back to public access for a legacy attachment', async () => {
    getSpy
      .mockResolvedValueOnce({ statusCode: 404, stream: null, blob: {} })
      .mockResolvedValueOnce(blobOf('legacy'));

    const loaded = await loadOutboundAttachments(['blob:attachments/org-1/id/old.pdf'], LIMITS);

    expect(loaded).toHaveLength(1);
    expect(getSpy).toHaveBeenNthCalledWith(2, 'attachments/org-1/id/old.pdf', expect.objectContaining({ access: 'public' }));
  });

  it('refuses more refs than the count ceiling before reading any', async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `blob:attachments/org-1/id/f${i}.pdf`);

    await expect(loadOutboundAttachments(refs, LIMITS)).rejects.toThrow(OutboundAttachmentError);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('refuses once the running total crosses the byte ceiling', async () => {
    getSpy
      .mockResolvedValueOnce(blobOf('a'.repeat(600)))
      .mockResolvedValueOnce(blobOf('b'.repeat(600)));

    await expect(loadOutboundAttachments(
      ['blob:attachments/org-1/id/a.pdf', 'blob:attachments/org-1/id/b.pdf'],
      LIMITS,
    )).rejects.toThrow(/total more than/);
  });

  it('refuses a ref that is not a stored attachment', async () => {
    await expect(loadOutboundAttachments(['https://elsewhere.example/x.pdf'], LIMITS))
      .rejects.toThrow(OutboundAttachmentError);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('refuses when the blob is gone', async () => {
    getSpy.mockResolvedValue({ statusCode: 404, stream: null, blob: {} });

    await expect(loadOutboundAttachments(['blob:attachments/org-1/id/gone.pdf'], LIMITS))
      .rejects.toThrow(/no longer available/);
  });

  // A storage error must arrive as OutboundAttachmentError like every other
  // failure here, so callers can treat the whole load as a definite pre-provider
  // refusal rather than an ambiguous outcome.
  it('wraps a storage error rather than letting it escape raw', async () => {
    getSpy.mockRejectedValue(new Error('connection reset'));

    await expect(loadOutboundAttachments(['blob:attachments/org-1/id/x.pdf'], LIMITS))
      .rejects.toThrow(OutboundAttachmentError);
  });
});

describe('getOutboundAttachmentLimits', () => {
  it('defaults below the smaller provider ceiling', () => {
    const limits = getOutboundAttachmentLimits({} as NodeJS.ProcessEnv);
    expect(limits).toEqual({ maxCount: 5, maxBytesEach: 7_340_032, maxTotalBytes: 7_340_032 });
  });

  it('reads overrides from the environment', () => {
    const limits = getOutboundAttachmentLimits({
      OUTBOUND_ATTACHMENT_MAX_COUNT: '2',
      OUTBOUND_ATTACHMENT_MAX_BYTES: '1024',
      OUTBOUND_ATTACHMENT_MAX_TOTAL_BYTES: '2048',
    } as NodeJS.ProcessEnv);
    expect(limits).toEqual({ maxCount: 2, maxBytesEach: 1024, maxTotalBytes: 2048 });
  });

  it('throws on a non-positive override rather than silently falling back', () => {
    expect(() => getOutboundAttachmentLimits({ OUTBOUND_ATTACHMENT_MAX_COUNT: '0' } as NodeJS.ProcessEnv))
      .toThrow(/must be a positive integer/);
  });
});
