import { headers } from 'next/headers';
import { renderOAuthPostShellHtml } from '@/lib/integrations/oauth-popup-shell';

export async function createPostRedirectResponse(
  request: Request,
  label = 'Continue',
): Promise<Response> {
  const url = new URL(request.url);
  const action = `${url.pathname}${url.search}`;
  // Clerk's middleware mints the CSP nonce and forwards it as `x-nonce` on the
  // request it hands to this handler, so it matches the header on this response.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return new Response(renderOAuthPostShellHtml({ action, nonce, title: label }), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
