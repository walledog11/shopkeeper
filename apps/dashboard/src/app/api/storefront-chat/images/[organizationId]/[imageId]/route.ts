import { get } from '@vercel/blob';
import { handleApiError } from '@/lib/api/errors';
import { chatImagePathname, chatImageUrl, parseChatImageUrl } from '@/lib/storefront-chat/images';

/** Public brand pictures; never accepts an arbitrary blob path or attachment. */
export async function GET(_request: Request, context: { params: Promise<{ organizationId: string; imageId: string }> }) {
  const { organizationId, imageId } = await context.params;
  if (!parseChatImageUrl(chatImageUrl(organizationId, imageId))) return new Response(null, { status: 404 });
  try {
    const result = await get(chatImagePathname(organizationId, imageId), { access: 'private' });
    if (result?.statusCode !== 200 || !result.stream) return new Response(null, { status: 404 });
    return new Response(result.stream, { headers: {
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    } });
  } catch (error) {
    return handleApiError(error, 'Chat picture GET', 'Could not load picture.');
  }
}
