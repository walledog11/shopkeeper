function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createPostRedirectResponse(request: Request, label = "Continue"): Response {
  const url = new URL(request.url)
  const action = `${url.pathname}${url.search}`
  const escapedAction = escapeHtml(action)
  const escapedLabel = escapeHtml(label)

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapedLabel}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #070707;
      color: rgba(255, 255, 255, 0.88);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .shopkeeper-oauth-loading {
      width: min(100%, 22rem);
      padding: 2.5rem 2rem;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.03);
      text-align: center;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
    }
    .spinner {
      width: 2.75rem;
      height: 2.75rem;
      margin: 0 auto 1.25rem;
      border-radius: 9999px;
      border: 2px solid rgba(255, 255, 255, 0.08);
      border-top-color: #4ade80;
      animation: spin 0.8s linear infinite;
    }
    .eyebrow {
      margin: 0 0 0.75rem;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.35);
    }
    h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
    }
    p {
      margin: 0.75rem 0 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.48);
    }
    form { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main class="shopkeeper-oauth-loading" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <p class="eyebrow">Shopkeeper</p>
    <h1>${escapedLabel}</h1>
    <p>Securely redirecting you to authorize this connection.</p>
  </main>
  <form id="post-redirect-form" method="post" action="${escapedAction}">
    <button type="submit">${escapedLabel}</button>
  </form>
  <script>document.getElementById("post-redirect-form").requestSubmit();</script>
</body>
</html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  )
}
