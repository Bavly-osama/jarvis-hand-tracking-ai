import { FastifyInstance } from 'fastify';
import { config } from '../config';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      wsConnections: (app as any).io?.engine?.clientsCount || 0,
      geminiStatus: config.geminiApiKey ? 'configured' : 'missing_key',
      timestamp: Date.now()
    };
  });
}
