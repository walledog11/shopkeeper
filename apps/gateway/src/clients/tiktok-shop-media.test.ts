import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadTikTokShopImage,
  isAllowedTikTokShopMediaUrl,
} from './tiktok-shop-media.js';

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TikTok Shop media download', () => {
  it.each([
    'https://p16-oec-sg.ibyteimg.com/photo.jpg',
    'https://p16-sign-sg.tiktokcdn.com/file.webp',
    'https://seller-us.tiktokshop.com/media/123',
  ])('allows a TikTok-owned HTTPS media URL: %s', (url) => {
    expect(isAllowedTikTokShopMediaUrl(url)).toBe(true);
  });

  it.each([
    'http://p16-oec-sg.ibyteimg.com/photo.jpg',
    'https://evilibyteimg.com/photo.jpg',
    'https://ibyteimg.com.evil.example/photo.jpg',
    'https://localhost/photo.jpg',
  ])('rejects an unsafe media URL: %s', (url) => {
    expect(isAllowedTikTokShopMediaUrl(url)).toBe(false);
  });

  it('downloads a bounded image without forwarding provider credentials', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(Buffer.from('image bytes'), {
      status: 200,
      headers: {
        'content-length': '11',
        'content-type': 'image/jpeg; charset=binary',
      },
    }));

    const attachment = await downloadTikTokShopImage(
      'https://p16-oec-sg.ibyteimg.com/photo.jpg?signature=secret',
    );

    expect(attachment).toEqual({
      filename: 'tiktok-image.jpg',
      contentType: 'image/jpeg',
      base64Content: Buffer.from('image bytes').toString('base64'),
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://p16-oec-sg.ibyteimg.com/photo.jpg?signature=secret',
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      cache: 'no-store',
      redirect: 'manual',
    }));
  });
});
