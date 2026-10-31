type Context = {
  request: Request;
  env: { API?: { fetch(request: Request): Promise<Response> } };
};

/** Preserve the public URL, Origin, cookies, and response headers end to end. */
export function onRequest({ request, env }: Context): Promise<Response> | Response {
  if (!env.API) {
    return Response.json(
      { error: { code: 'API_NOT_CONFIGURED', message: 'This environment has no API binding' } },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      },
    );
  }
  return env.API.fetch(request);
}
