interface PagesContext {
  request: Request;
  params: {
    endpoint: string;
  };
}

const ALLOWED_ENDPOINTS = new Set(['fleetcarrier']);
const UPSTREAM = 'https://companion.orerve.net';
const USER_AGENT = 'CarrierHelper/0.1 (+https://edcarrier.threethree.cc/)';

function noStore(body: BodyInit | null, status: number, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  return new Response(body, { status, headers });
}

function jsonError(message: string, status: number): Response {
  return noStore(JSON.stringify({ error: message }), status, {
    'Content-Type': 'application/json',
  });
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  if (context.request.method !== 'GET') {
    return noStore('Method not allowed', 405, { Allow: 'GET' });
  }

  const endpoint = context.params.endpoint;
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonError('Unknown CAPI endpoint.', 404);
  }

  const authorization = context.request.headers.get('Authorization');
  if (!authorization) {
    return jsonError('Missing Frontier authorization.', 401);
  }

  const upstream = new URL(endpoint, `${UPSTREAM}/`);
  const language = new URL(context.request.url).searchParams.get('language');
  if (language) upstream.searchParams.set('language', language);

  const headers = new Headers({
    Authorization: authorization,
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  });
  const acceptLanguage = context.request.headers.get('Accept-Language');
  if (acceptLanguage) headers.set('Accept-Language', acceptLanguage);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual',
    });
  } catch {
    return jsonError('Frontier CAPI request failed.', 502);
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    'Content-Type',
    upstreamResponse.headers.get('Content-Type') ?? 'application/json',
  );
  responseHeaders.set('Cache-Control', 'no-store');
  const retryAfter = upstreamResponse.headers.get('Retry-After');
  if (retryAfter) responseHeaders.set('Retry-After', retryAfter);

  return new Response(
    upstreamResponse.status === 204 ? null : upstreamResponse.body,
    {
      status: upstreamResponse.status,
      headers: responseHeaders,
    },
  );
};
