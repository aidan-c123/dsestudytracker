/**
 * Preview-only Worker entry.
 *
 * Vercel serves the real app: static files from `public/` plus api/index.js.
 * This worker exists so the in-chat preview can run the same router against an
 * in-memory store, since the preview has no database and no outbound network.
 *
 * It is not part of the Vercel deployment.
 */

import { handleApi } from '../server/routes.js';
import previewStore from './store.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const route = url.searchParams.get('__p');
      let path;
      if (route) path = `/${route}`.replace(/\/+$/, '') || '/health';
      else path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/health';

      // Rebuild the request without __p so route handlers see a clean URL.
      const clean = new URL(request.url);
      clean.searchParams.delete('__p');
      const proxied = new Request(clean.toString(), {
        method: request.method,
        headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
      });

      return handleApi(proxied, path, previewStore);
    }

    return env.ASSETS.fetch(request);
  }
};
