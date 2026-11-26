import { handleApi } from '../server/routes.js';

/**
 * Vercel Node.js function. Supports both the Web `Request`/`Response`
 * signature and the classic `(req, res)` signature so the same handler
 * works on Vercel and on any Node server.
 */
export default async function handler(request, response) {
  const isWeb = typeof request?.headers?.get === 'function' && !response;

  if (isWeb) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    return handleApi(request, path);
  }

  // Classic Node signature
  const { IncomingMessage, ServerResponse } = await import('node:http');
  void IncomingMessage;
  void ServerResponse;

  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';

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
