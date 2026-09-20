import { FastifyInstance } from 'fastify';
import { config } from '../config';

export async function healthRoutes(app: FastifyInstance) {
  const healthHandler = async () => ({
    status: 'ok',
    uptime: process.uptime(),
    wsConnections: (app as any).io?.engine?.clientsCount || 0,
    geminiStatus: config.geminiApiKey ? 'configured' : 'missing_key',
    websocket: (app as any).io ? 'enabled' : 'disabled',
    timestamp: Date.now(),
  });

  // Local / Docker
  app.get('/health', healthHandler);
  // Vercel rewrite: /health → /api/health
  app.get('/api/health', healthHandler);
}
