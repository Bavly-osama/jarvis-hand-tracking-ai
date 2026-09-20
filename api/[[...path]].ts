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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
