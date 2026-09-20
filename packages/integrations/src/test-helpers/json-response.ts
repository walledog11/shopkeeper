/** JSON `Response` helper for fetch stubs in unit tests. */
export function jsonResponse(body: unknown, init: number | ResponseInit = {}): Response {
  const responseInit: ResponseInit = typeof init === 'number' ? { status: init } : init;

  return new Response(JSON.stringify(body), {
    ...responseInit,
    status: responseInit.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...responseInit.headers },
  });
}
