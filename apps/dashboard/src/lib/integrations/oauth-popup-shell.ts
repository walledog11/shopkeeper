export type OAuthPopupVisualState = 'loading' | 'success' | 'error';

function escapeOAuthPopupHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderOAuthPostShellHtml(options: {
  action: string;
  nonce?: string;
  title: string;
}): string {
  const action = escapeOAuthPopupHtml(options.action);
  const title = escapeOAuthPopupHtml(options.title);
  // The enforced CSP is `strict-dynamic` + per-request nonce, so an un-nonced
  // inline script is dropped, the form never submits, and the popup spins
  // forever. The nonce comes from the same middleware pass that sets the header.
  const nonceAttr = options.nonce ? ` nonce="${escapeOAuthPopupHtml(options.nonce)}"` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #000; color: #fff; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(100%, 352px); padding: 32px 28px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: #111; text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,.35); }
    .spinner { width: 28px; height: 28px; margin: 0 auto 18px; border: 2px solid rgba(255,255,255,.1); border-top-color: #fbbf24; border-radius: 999px; animation: spin .8s linear infinite; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    /* Hidden while the auto-submit is expected to win, then revealed so a
       blocked script degrades to a clickable button instead of a dead spinner. */
    form { margin: 18px 0 0; opacity: 0; animation: reveal 0s linear 4s forwards; }
    form button { padding: 10px 20px; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; background: #1c1c1c; color: #fff; font: inherit; font-size: 14px; cursor: pointer; }
    @keyframes reveal { to { opacity: 1; } }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main aria-live="polite"><div class="spinner" aria-hidden="true"></div><h1>${title}</h1></main>
  <form id="oauth-post" method="post" action="${action}"><button type="submit">Continue</button></form>
  <script${nonceAttr}>document.getElementById("oauth-post").requestSubmit();</script>
</body>
</html>`;
}
