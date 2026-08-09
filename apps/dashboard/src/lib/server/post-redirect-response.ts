import { renderOAuthPostShellHtml } from '@/lib/integrations/oauth-popup-shell';

export function createPostRedirectResponse(
  request: Request,
  label = 'Continue',
): Response {
  const url = new URL(request.url);
  const action = `${url.pathname}${url.search}`;

  return new Response(renderOAuthPostShellHtml({ action, title: label }), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
