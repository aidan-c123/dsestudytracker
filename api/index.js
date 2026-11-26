import { handleApi } from '../server/routes.js';

/**
 * The single API entry point.
 *
 * vercel.json rewrites `/api/(.*)` to `/api?__p=$1`, so this file does not
 * rely on bracket-named catch-all routes — those are unreliable in a
 * non-framework `api/` directory.
 *
 * Supports both the Web `Request`/`Response` signature and the classic
 * `(req, res)` signature.
 */

function pathFrom(url) {
  const viaQuery = url.searchParams.get('__p');
  if (viaQuery) return `/${viaQuery}`.replace(/\/+$/, '') || '/';
  const direct = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '');
  // Hitting /api or /api/ directly should explain itself rather than 404.
  return direct || '/health';
}

export default async function handler(request, response) {
  const isWeb = typeof request?.headers?.get === 'function' && !response;

  if (isWeb) {
    const url = new URL(request.url);
    return handleApi(request, pathFrom(url));
  }

  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const path = pathFrom(url);

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, String(value));
  }

  const method = (request.method || 'GET').toUpperCase();
  const webRequest = new Request(url.toString(), {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) || !raw ? undefined : raw
  });

  const result = await handleApi(webRequest, path);
  response.statusCode = result.status;
  result.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(await result.text());
}
