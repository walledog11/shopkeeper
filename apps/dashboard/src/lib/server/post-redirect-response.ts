import { renderGmailOAuthPopupHtml, renderOAuthPopupHtml } from "@/lib/integrations/oauth-popup-shell";

export type PostRedirectShell = "default" | "gmail";

export function createPostRedirectResponse(
  request: Request,
  label = "Continue",
  shell: PostRedirectShell = "default",
): Response {
  const url = new URL(request.url);
  const action = `${url.pathname}${url.search}`;
  const htmlOptions = {
    title: label,
    message: shell === "gmail"
      ? "Completing your Gmail connection."
      : "Securely redirecting you to authorize this connection.",
    footer: shell === "gmail" ? "Just a moment…" : "This window will continue automatically.",
    state: "loading" as const,
    postAction: action,
    postLabel: label,
  };

  return new Response(
    shell === "gmail"
      ? renderGmailOAuthPopupHtml(htmlOptions)
      : renderOAuthPopupHtml(htmlOptions),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}
