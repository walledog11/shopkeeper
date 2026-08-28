/**
 * A JSON `Response` for tests that stub `fetch`.
 *
 * This had fourteen near-identical definitions across the repo, split across two
 * call conventions — a positional status and a `ResponseInit`. Both are accepted
 * here so neither set of call sites had to be rewritten to adopt it.
 *
 * `Content-Type: application/json` is the default; anything in `headers` merges
 * over it, so a stub can add `retry-after` or an rfc5988 `Link` without
 * restating the content type.
 */
export function jsonResponse(body: unknown, init: number | ResponseInit = {}): Response {
  const responseInit: ResponseInit = typeof init === "number" ? { status: init } : init;

  return new Response(JSON.stringify(body), {
    ...responseInit,
    status: responseInit.status ?? 200,
    headers: { "Content-Type": "application/json", ...responseInit.headers },
  });
}
