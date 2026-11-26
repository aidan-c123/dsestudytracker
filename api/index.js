import { handleApi } from '../server/routes.js';

/**
 * The single API entry point, served at `/api`.
 *
 * Plain `api/` folders on Vercel do not support bracket-named catch-all
 * routes, and `vercel.json` rewrites proved fragile, so the browser sends the
 * route in a query string instead:
 *
 *   /api?__p=me
 *   /api?__p=papers/507f1f77bcf86cd799439011
 *
 * `/api` with no `__p` returns the health check.
 */

function pathFrom(url) {
  const raw = url.searchParams.get('__p');
  if (raw) {
    const cleaned = `/${raw}`.replace(/\/+$/, '');
    return cleaned || '/health';
  }
  return '/health';
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
