import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticPlugin from '@fastify/static';
import path from 'path';
import { setupWebSocket } from './websocket/WebSocketGateway';
import { healthRoutes } from './routes/health';
import { configRoutes } from './routes/config';
import { preferencesRoutes } from './routes/preferences';
import { telemetryRoutes } from './routes/telemetry';
import { aiRoutes } from './routes/ai.routes';
import { setupRateLimiter } from './middleware/rateLimiter';
import { setupErrorHandler } from './middleware/errorHandler';
import { config } from './config';

// Resolved path to the Vite-built frontend
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export interface BuildAppOptions {
  /** Skip Socket.IO + static SPA (Vercel serverless). */
  serverless?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const { serverless = false } = options;
  const app = Fastify({
    logger: false,
    // Vercel sits behind a proxy
    trustProxy: serverless,
  });

  // Security — disable CSP so Three.js + MediaPipe CDN assets load locally
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });

  // On Vercel the frontend and API share the same origin; locally allow configured origins.
  await app.register(cors, {
    origin: serverless ? true : config.corsOrigin,
  });

  await setupRateLimiter(app);
  setupErrorHandler(app);

  if (serverless) {
    // Vercel may pre-parse JSON; avoid double-read of an empty stream
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        const raw = req.raw as { body?: unknown };
        if (raw.body !== undefined) {
          done(null, raw.body);
          return;
        }
        const text = typeof body === 'string' ? body : body.toString('utf8');
        done(null, text ? JSON.parse(text) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  if (!serverless) {
    // WebSocket must be registered before static so /socket.io/* is handled first
    setupWebSocket(app);
  }

  // REST API routes
  await app.register(healthRoutes);
  await app.register(configRoutes);
  await app.register(preferencesRoutes);
  await app.register(telemetryRoutes);
  await app.register(aiRoutes);

  if (!serverless) {
    // Serve built Vite frontend from /
    await app.register(staticPlugin, {
      root: CLIENT_DIST,
      prefix: '/',
    });

    // SPA fallback — any unknown route returns index.html
    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html');
    });
  }

  return app;
}
