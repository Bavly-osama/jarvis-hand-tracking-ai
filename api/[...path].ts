/**
 * Vercel serverless entry — Fastify REST API only.
 * Socket.IO is not supported on Vercel Functions; the client uses REST for AI.
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

/** Rebuild /api/... so Fastify matches registered routes. */
function restoreApiUrl(req: VercelRequest): void {
  const parts = req.query.path;
  const suffix = Array.isArray(parts)
    ? parts.filter(Boolean).join('/')
    : typeof parts === 'string'
      ? parts
      : '';

  const searchIdx = req.url?.indexOf('?') ?? -1;
  const search = searchIdx >= 0 ? req.url!.slice(searchIdx) : '';
  req.url = (suffix ? `/api/${suffix}` : '/api') + search;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  restoreApiUrl(req);
  const app = await getApp();
  app.server.emit('request', req, res);
}
