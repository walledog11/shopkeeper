export type OAuthPopupVisualState = 'loading' | 'success' | 'error';

export function escapeOAuthPopupHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderOAuthPostShellHtml(options: {
  action: string;
  title: string;
}): string {
  const action = escapeOAuthPopupHtml(options.action);
  const title = escapeOAuthPopupHtml(options.title);

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
    form { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main aria-live="polite"><div class="spinner" aria-hidden="true"></div><h1>${title}</h1></main>
  <form id="oauth-post" method="post" action="${action}"><button type="submit">Continue</button></form>
  <script>document.getElementById("oauth-post").requestSubmit();</script>
</body>
</html>`;
}
