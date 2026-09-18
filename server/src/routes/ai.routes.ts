import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AIIntentRequestSchema } from '../ai/AIIntentSchema';
import { GestureIntentRouter } from '../gestures/GestureIntentRouter';
import { geminiService } from '../ai/GeminiService';
import { aiIntentCache } from '../ai/AIIntentCache';
import { logger } from '../utils/logger';

export const aiRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/ai/intent — Infer user intent from structured features
  app.post('/api/ai/intent', async (request, reply) => {
    const parseResult = AIIntentRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid AI intent request payload',
        details: parseResult.error.errors,
      });
    }

    try {
      const result = await GestureIntentRouter.routeAndResolve(parseResult.data);
      return reply.send(result.response);
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed processing AI intent request');
      return reply.status(500).send({
        intent: 'NONE',
        confidence: 0,
        reason: 'Internal inference error',
        source: 'fallback',
      });
    }
  });

  // GET /api/ai/health — Check Gemini model availability and latency
  app.get('/api/ai/health', async (_request, reply) => {
    const health = await geminiService.healthCheck();
    return reply.send({
      status: health.ok ? 'ok' : 'degraded',
      model: health.model,
      available: geminiService.isAvailable(),
      latencyMs: health.latencyMs,
      timestamp: Date.now(),
    });
  });

  // GET /api/ai/metrics — Telemetry & usage metrics
  app.get('/api/ai/metrics', async (_request, reply) => {
    const metrics = aiIntentCache.getMetrics();
    return reply.send({
      ...metrics,
      timestamp: Date.now(),
    });
  });
};
