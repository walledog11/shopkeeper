import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadInstagramAttachment,
  isAllowedInstagramMediaUrl,
  isSupportedInstagramBinaryAttachment,
} from './instagram-media.js';

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Instagram media download', () => {
  it.each([
    'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123',
    'https://scontent-lax3-2.cdninstagram.com/file.jpg',
    'https://video.xx.fbcdn.net/file.mp4',
    'https://www.instagram.com/reel/example/',
  ])('allows a Meta-owned HTTPS media URL: %s', (url) => {
    expect(isAllowedInstagramMediaUrl(url)).toBe(true);
  });

  it.each([
    'http://lookaside.fbsbx.com/file',
    'https://evilfbsbx.com/file',
    'https://fbsbx.com.evil.example/file',
    'https://localhost/file',
    'https://user:password@lookaside.fbsbx.com/file',
    'https://lookaside.fbsbx.com:8443/file',
  ])('rejects an unsafe media URL: %s', (url) => {
    expect(isAllowedInstagramMediaUrl(url)).toBe(false);
  });

  it('only downloads supported binary attachment types', () => {
    expect(isSupportedInstagramBinaryAttachment('image')).toBe(true);
    expect(isSupportedInstagramBinaryAttachment('MEDIA')).toBe(true);
    expect(isSupportedInstagramBinaryAttachment('share')).toBe(false);
    expect(isSupportedInstagramBinaryAttachment('story_mention')).toBe(false);
  });

  it('downloads a bounded image without forwarding provider credentials', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(Buffer.from('image bytes'), {
      status: 200,
      headers: {
        'content-length': '11',
        'content-type': 'image/jpeg; charset=binary',
      },
    }));

    const attachment = await downloadInstagramAttachment({
      type: 'image',
      url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123&signature=secret',
    });

    expect(attachment).toEqual({
      filename: 'instagram-image.jpg',
      contentType: 'image/jpeg',
      base64Content: Buffer.from('image bytes').toString('base64'),
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123&signature=secret',
      expect.objectContaining({ cache: 'no-store', redirect: 'manual' }),
    );
    expect(fetchSpy.mock.calls[0][1]).not.toHaveProperty('headers.Authorization');
  });

  it('validates every redirect before following it', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: 'https://internal.example.test/private' },
    }));

    await expect(downloadInstagramAttachment({
      type: 'image',
      url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123',
    })).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('follows a bounded redirect between allowed Meta media hosts', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://scontent-lax3-2.cdninstagram.com/photo.png' },
      }))
      .mockResolvedValueOnce(new Response(Buffer.from('png'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }));

    const attachment = await downloadInstagramAttachment({
      type: 'image',
      url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123',
    });

    expect(attachment?.filename).toBe('instagram-image.png');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects mismatched or oversized provider responses', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('<svg></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          'content-length': String(10 * 1024 * 1024 + 1),
          'content-type': 'video/mp4',
        },
      }));

    await expect(downloadInstagramAttachment({
      type: 'image',
      url: 'https://lookaside.fbsbx.com/image',
    })).resolves.toBeNull();
    await expect(downloadInstagramAttachment({
      type: 'video',
      url: 'https://lookaside.fbsbx.com/video',
    })).resolves.toBeNull();
  });

  it('stops reading when a provider omits the length and streams too many bytes', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(body, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));

    await expect(downloadInstagramAttachment({
      type: 'image',
      url: 'https://lookaside.fbsbx.com/image-without-length',
    })).resolves.toBeNull();
  });
});
