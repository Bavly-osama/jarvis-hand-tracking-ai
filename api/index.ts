/**
 * Vercel serverless entry — Fastify REST API only.
 * Socket.IO is not supported on Vercel Functions; the client uses REST for AI.
 *
 * vercel.json rewrites /health and /api/* onto this function with ?route=<original path>.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/src/app';

let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp({ serverless: true }).then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

function restoreUrl(req: VercelRequest): void {
  const route = typeof req.query.route === 'string' ? req.query.route : '';
  if (route.startsWith('/')) {
    // Drop the internal route query param; keep any real client query string
    const raw = req.url || '/';
    const qIndex = raw.indexOf('?');
    if (qIndex < 0) {
      req.url = route;
      return;
    }
    const params = new URLSearchParams(raw.slice(qIndex + 1));
    params.delete('route');
    const rest = params.toString();
    req.url = rest ? `${route}?${rest}` : route;
    return;
  }

  // Fallback: already at /api/...
  if (req.url && req.url !== '/api' && req.url !== '/api/') {
    return;
  }
  req.url = '/api/health';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  restoreUrl(req);
  const app = await getApp();
  app.server.emit('request', req, res);
}
