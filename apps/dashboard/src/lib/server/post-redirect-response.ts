import { renderOAuthPopupHtml } from "@/lib/integrations/oauth-popup-shell";

export function createPostRedirectResponse(request: Request, label = "Continue"): Response {
  const url = new URL(request.url);
  const action = `${url.pathname}${url.search}`;

  return new Response(
    renderOAuthPopupHtml({
      title: label,
      message: "Securely redirecting you to authorize this connection.",
      footer: "This window will continue automatically.",
      state: "loading",
      postAction: action,
      postLabel: label,
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}
