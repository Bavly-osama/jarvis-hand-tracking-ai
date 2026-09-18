import { FastifyInstance } from 'fastify';
import { telemetryService } from '../services/TelemetryService';
import { config } from '../config';

export async function telemetryRoutes(app: FastifyInstance) {
  app.get('/api/telemetry/logs', async (request, reply) => {
    if (config.logLevel !== 'debug' && process.env.NODE_ENV !== 'development') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    return telemetryService.getRecentLogs();
  });

  app.delete('/api/telemetry/logs', async (request, reply) => {
    if (config.logLevel !== 'debug' && process.env.NODE_ENV !== 'development') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    telemetryService.clearLogs();
    return { status: 'cleared' };
  });
}
