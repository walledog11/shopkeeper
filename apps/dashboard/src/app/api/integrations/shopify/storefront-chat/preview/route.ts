import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { withOrgRoute } from '@/lib/api/route';
import { chatPreviewContentSecurityPolicy, chatPreviewDocument } from '@/lib/storefront-chat/preview-document';

export const GET = withOrgRoute(
  { context: 'Chat preview GET', errorMessage: 'Could not load the chat preview.' },
  async () => {
    const middlewareNonce = (await headers()).get('x-nonce');
    const nonce = middlewareNonce && /^[\w+/=-]+$/.test(middlewareNonce)
      ? middlewareNonce : randomBytes(18).toString('base64');
    return new Response(await chatPreviewDocument(nonce), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
        'Content-Security-Policy': chatPreviewContentSecurityPolicy(nonce, ["'self'"]),
      },
    });
  },
);
