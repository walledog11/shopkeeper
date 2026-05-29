function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
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
  <meta name="robots" content="noindex">
  <title>${escapedLabel}</title>
</head>
<body>
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
