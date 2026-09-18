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

export async function buildApp() {
  const app = Fastify({ logger: false });

  // Security — disable CSP so Three.js + MediaPipe CDN assets load locally
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });

  await app.register(cors, { origin: config.corsOrigin });

  await setupRateLimiter(app);
  setupErrorHandler(app);

  // WebSocket must be registered before static so /socket.io/* is handled first
  setupWebSocket(app);

  // REST API routes
  await app.register(healthRoutes);
  await app.register(configRoutes);
  await app.register(preferencesRoutes);
  await app.register(telemetryRoutes);
  await app.register(aiRoutes);

  // Serve built Vite frontend from /
  await app.register(staticPlugin, {
    root: CLIENT_DIST,
    prefix: '/',
  });

  // SPA fallback — any unknown route returns index.html
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');
  });

  return app;
}
