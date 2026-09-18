import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config';

export async function setupRateLimiter(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute'
  });
}
