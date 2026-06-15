import { PRODUCT_NAME } from "@/lib/brand";
import { OAUTH_POPUP_NAME, OAUTH_POPUP_SESSION_KEY } from "@/lib/integrations/oauth-flow";

/** Design tokens aligned with apps/dashboard/src/app/globals.css */
export const OAUTH_POPUP_TOKENS = {
  background: "#000000",
  card: "#111111",
  border: "rgba(255, 255, 255, 0.08)",
  foreground: "#ffffff",
  mutedForeground: "rgba(255, 255, 255, 0.40)",
  primary: "#fbbf24",
  success: "#34d399",
  destructive: "#f87171",
} as const;

export type OAuthPopupVisualState = "loading" | "success" | "error";

export function escapeOAuthPopupHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const OAUTH_POPUP_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: ${OAUTH_POPUP_TOKENS.background};
    color: ${OAUTH_POPUP_TOKENS.foreground};
    font-family: "Google Sans Flex", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .shopkeeper-oauth-popup {
    width: min(100%, 22rem);
    padding: 2rem 1.75rem 1.75rem;
    border: 1px solid ${OAUTH_POPUP_TOKENS.border};
    border-radius: 1rem;
    background: ${OAUTH_POPUP_TOKENS.card};
    text-align: center;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  }
  .shopkeeper-oauth-popup__logo {
    width: 2rem;
    height: 2rem;
    margin: 0 auto 1rem;
    border-radius: 0.375rem;
    display: block;
  }
  .shopkeeper-oauth-popup__icon {
    width: 3.5rem;
    height: 3.5rem;
    margin: 0 auto 1rem;
    border-radius: 1rem;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.06);
  }
  .shopkeeper-oauth-popup__spinner {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    border: 2px solid rgba(255, 255, 255, 0.08);
    border-top-color: ${OAUTH_POPUP_TOKENS.primary};
    animation: shopkeeper-oauth-spin 0.8s linear infinite;
  }
  .shopkeeper-oauth-popup__brand {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.72);
  }
  h1 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${OAUTH_POPUP_TOKENS.foreground};
  }
  .shopkeeper-oauth-popup__message {
    margin: 0.625rem 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: ${OAUTH_POPUP_TOKENS.mutedForeground};
  }
  .shopkeeper-oauth-popup__footer {
    margin: 1.25rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.28);
  }
  form { display: none; }
  @keyframes shopkeeper-oauth-spin { to { transform: rotate(360deg); } }
`;

export function renderOAuthPopupHtml(options: {
  title: string;
  message: string;
  footer?: string;
  state?: OAuthPopupVisualState;
  postAction?: string;
  postLabel?: string;
}): string {
  const title = escapeOAuthPopupHtml(options.title);
  const message = escapeOAuthPopupHtml(options.message);
  const footer = escapeOAuthPopupHtml(options.footer ?? "Securely redirecting you to authorize this connection.");
  const brand = escapeOAuthPopupHtml(PRODUCT_NAME);
  const state = options.state ?? "loading";
  const iconMarkup =
    state === "loading"
      ? `<div class="shopkeeper-oauth-popup__icon" aria-hidden="true"><div class="shopkeeper-oauth-popup__spinner"></div></div>`
      : `<img class="shopkeeper-oauth-popup__logo" src="/logos/shopkeeper-shop-logo.png" alt="" width="32" height="32" />`;

  const formMarkup =
    options.postAction && options.postLabel
      ? `<form id="post-redirect-form" method="post" action="${escapeOAuthPopupHtml(options.postAction)}">
    <button type="submit">${escapeOAuthPopupHtml(options.postLabel)}</button>
  </form>
  <script>
    try {
      if (window.name === ${JSON.stringify(OAUTH_POPUP_NAME)}) {
        sessionStorage.setItem(${JSON.stringify(OAUTH_POPUP_SESSION_KEY)}, "1");
      }
    } catch (e) {}
    document.getElementById("post-redirect-form").requestSubmit();
  </script>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,400..700&amp;display=swap">
  <style>${OAUTH_POPUP_CSS}</style>
</head>
<body>
  <main class="shopkeeper-oauth-popup" aria-live="polite">
    ${iconMarkup}
    <p class="shopkeeper-oauth-popup__brand">${brand}</p>
    <h1>${title}</h1>
    <p class="shopkeeper-oauth-popup__message">${message}</p>
    <p class="shopkeeper-oauth-popup__footer">${footer}</p>
  </main>
  ${formMarkup}
</body>
</html>`;
}
