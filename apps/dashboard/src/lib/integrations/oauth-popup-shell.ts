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

function serializeOAuthPopupScriptString(value: string): string {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("&", "\\x26")
    .replaceAll("<", "\\x3C")
    .replaceAll(">", "\\x3E")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")}"`;
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
  @keyframes shopkeeper-oauth-pulse { 50% { opacity: 0.45; } }
`;

const GMAIL_OAUTH_POPUP_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 1rem;
    background: ${OAUTH_POPUP_TOKENS.background};
    color: ${OAUTH_POPUP_TOKENS.foreground};
    font-family: "Google Sans Flex", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .shopkeeper-gmail-oauth-popup {
    position: relative;
    width: min(100%, 26.25rem);
    margin: 0 auto;
    padding: 1.5rem;
    border: 1px solid ${OAUTH_POPUP_TOKENS.border};
    border-radius: 1rem;
    background: ${OAUTH_POPUP_TOKENS.card};
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  }
  .shopkeeper-gmail-oauth-popup__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
    padding-right: 1.5rem;
  }
  .shopkeeper-gmail-oauth-popup__logo {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 1rem;
    object-fit: contain;
    background: rgba(255, 255, 255, 0.04);
  }
  .shopkeeper-gmail-oauth-popup__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: ${OAUTH_POPUP_TOKENS.foreground};
  }
  .shopkeeper-gmail-oauth-popup__stack {
    display: grid;
    gap: 1.25rem;
  }
  .shopkeeper-gmail-oauth-popup__section {
    display: grid;
    gap: 0.625rem;
  }
  .shopkeeper-gmail-oauth-popup__skeleton {
    border-radius: 0.375rem;
    background: rgba(255, 255, 255, 0.08);
    animation: shopkeeper-oauth-pulse 1.5s ease-in-out infinite;
  }
  .shopkeeper-gmail-oauth-popup__account {
    height: 3.375rem;
    border-radius: 0.75rem;
  }
  .shopkeeper-gmail-oauth-popup__section-title {
    height: 1.25rem;
    width: 6rem;
  }
  .shopkeeper-gmail-oauth-popup__panel {
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.02);
  }
  .shopkeeper-gmail-oauth-popup__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .shopkeeper-gmail-oauth-popup__row:first-child {
    border-top: 0;
  }
  .shopkeeper-gmail-oauth-popup__row-icon {
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }
  .shopkeeper-gmail-oauth-popup__row-main {
    height: 0.875rem;
    flex: 1;
  }
  .shopkeeper-gmail-oauth-popup__row-side {
    height: 0.875rem;
    width: 4rem;
    flex-shrink: 0;
  }
  .shopkeeper-gmail-oauth-popup__support-copy {
    display: grid;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
  }
  .shopkeeper-gmail-oauth-popup__support-line {
    height: 0.875rem;
  }
  .shopkeeper-gmail-oauth-popup__support-line--short {
    width: 72%;
  }
  .shopkeeper-gmail-oauth-popup__support-input {
    display: flex;
    gap: 0.75rem;
    padding: 0 1.25rem 1rem;
  }
  .shopkeeper-gmail-oauth-popup__input {
    height: 2.5rem;
    flex: 1;
    border-radius: 0.375rem;
  }
  .shopkeeper-gmail-oauth-popup__save {
    height: 0.875rem;
    width: 5rem;
    align-self: center;
  }
  .shopkeeper-gmail-oauth-popup__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    border-radius: 1rem;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(2px);
    text-align: center;
  }
  .shopkeeper-gmail-oauth-popup__overlay-icon {
    width: 3.5rem;
    height: 3.5rem;
    margin-bottom: 1rem;
    border-radius: 1rem;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.06);
  }
  .shopkeeper-gmail-oauth-popup__spinner {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    border: 2px solid rgba(255, 255, 255, 0.08);
    border-top-color: ${OAUTH_POPUP_TOKENS.primary};
    animation: shopkeeper-oauth-spin 0.8s linear infinite;
  }
  .shopkeeper-gmail-oauth-popup__overlay-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: ${OAUTH_POPUP_TOKENS.foreground};
  }
  .shopkeeper-gmail-oauth-popup__overlay-message {
    margin: 0.5rem 0 0;
    max-width: 16rem;
    font-size: 0.875rem;
    line-height: 1.5;
    color: ${OAUTH_POPUP_TOKENS.mutedForeground};
  }
  .shopkeeper-gmail-oauth-popup__overlay-footer {
    margin: 1rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.28);
  }
  form { display: none; }
`;

function renderGmailSkeletonRows(count: number): string {
  return Array.from({ length: count }).map(() => `
    <div class="shopkeeper-gmail-oauth-popup__row">
      <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__row-icon"></div>
      <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__row-main"></div>
      <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__row-side"></div>
    </div>
  `).join("");
}

function renderGmailSkeletonSection(titleWidth: string, rows: number): string {
  return `
    <section class="shopkeeper-gmail-oauth-popup__section">
      <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__section-title" style="width:${titleWidth}"></div>
      <div class="shopkeeper-gmail-oauth-popup__panel">
        ${renderGmailSkeletonRows(rows)}
      </div>
    </section>
  `;
}

function renderGmailOAuthPopupMarkup(options: {
  title: string;
  message: string;
  footer?: string;
}): string {
  const title = escapeOAuthPopupHtml(options.title);
  const message = escapeOAuthPopupHtml(options.message);
  const footer = escapeOAuthPopupHtml(options.footer ?? "Just a moment…");

  return `
    <main class="shopkeeper-gmail-oauth-popup" aria-live="polite">
      <div class="shopkeeper-gmail-oauth-popup__header">
        <img class="shopkeeper-gmail-oauth-popup__logo" src="/logos/gmail.png" alt="" width="56" height="56" />
        <h1 class="shopkeeper-gmail-oauth-popup__title">Gmail</h1>
      </div>
      <div class="shopkeeper-gmail-oauth-popup__stack">
        <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__account"></div>
        ${renderGmailSkeletonSection("6rem", 3)}
        ${renderGmailSkeletonSection("6rem", 1)}
        <section class="shopkeeper-gmail-oauth-popup__section">
          <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__section-title" style="width:7rem"></div>
          <div class="shopkeeper-gmail-oauth-popup__panel">
            <div class="shopkeeper-gmail-oauth-popup__support-copy">
              <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__support-line" style="width:10rem"></div>
              <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__support-line"></div>
              <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__support-line shopkeeper-gmail-oauth-popup__support-line--short"></div>
            </div>
            <div class="shopkeeper-gmail-oauth-popup__support-input">
              <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__input"></div>
              <div class="shopkeeper-gmail-oauth-popup__skeleton shopkeeper-gmail-oauth-popup__save"></div>
            </div>
          </div>
        </section>
        ${renderGmailSkeletonSection("4rem", 2)}
      </div>
      <div class="shopkeeper-gmail-oauth-popup__overlay">
        <div class="shopkeeper-gmail-oauth-popup__overlay-icon" aria-hidden="true">
          <div class="shopkeeper-gmail-oauth-popup__spinner"></div>
        </div>
        <h2 class="shopkeeper-gmail-oauth-popup__overlay-title">${title}</h2>
        <p class="shopkeeper-gmail-oauth-popup__overlay-message">${message}</p>
        <p class="shopkeeper-gmail-oauth-popup__overlay-footer">${footer}</p>
      </div>
    </main>
  `;
}

export function renderGmailOAuthPopupHtml(options: {
  title: string;
  message: string;
  footer?: string;
  postAction?: string;
  postLabel?: string;
}): string {
  const title = escapeOAuthPopupHtml(options.title);
  const popupName = serializeOAuthPopupScriptString(OAUTH_POPUP_NAME);
  const sessionKey = serializeOAuthPopupScriptString(OAUTH_POPUP_SESSION_KEY);
  const formMarkup =
    options.postAction && options.postLabel
      ? `<form id="post-redirect-form" method="post" action="${escapeOAuthPopupHtml(options.postAction)}">
    <button type="submit">${escapeOAuthPopupHtml(options.postLabel)}</button>
  </form>
  <script>
    try {
      if (window.name === ${popupName}) {
        sessionStorage.setItem(${sessionKey}, "1");
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
  <style>${GMAIL_OAUTH_POPUP_CSS}</style>
</head>
<body>
  ${renderGmailOAuthPopupMarkup(options)}
  ${formMarkup}
</body>
</html>`;
}

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
  const popupName = serializeOAuthPopupScriptString(OAUTH_POPUP_NAME);
  const sessionKey = serializeOAuthPopupScriptString(OAUTH_POPUP_SESSION_KEY);
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
      if (window.name === ${popupName}) {
        sessionStorage.setItem(${sessionKey}, "1");
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
