import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export function setupErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded'
      });
    }

    logger.error({ err: error, url: request.url }, 'Unhandled error');
    
    reply.status(error.statusCode || 500).send({
      error: 'Internal Server Error',
      message: error.message || 'Something went wrong',
      statusCode: error.statusCode || 500
    });
  });
}
