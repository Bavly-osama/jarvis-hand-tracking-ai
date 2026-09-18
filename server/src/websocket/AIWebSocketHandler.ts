import { Socket } from 'socket.io';
import { AIIntentRequestSchema, AIIntentRequest } from '../ai/AIIntentSchema';
import { GestureIntentRouter } from '../gestures/GestureIntentRouter';
import { logger } from '../utils/logger';

export class AIWebSocketHandler {
  public static registerHandlers(socket: Socket, getSessionId: () => string | null): void {
    socket.on('ai:intent-request', async (payload: any) => {
      const sessionId = getSessionId() || payload?.sessionId || 'unknown';

      const enriched: AIIntentRequest = {
        ...payload,
        sessionId,
        requestId: payload?.requestId || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        stateVersion: payload?.stateVersion ?? 1,
        timestamp: payload?.timestamp || Date.now(),
      };

      const parseResult = AIIntentRequestSchema.safeParse(enriched);
      if (!parseResult.success) {
        socket.emit('ai:error', {
          requestId: enriched.requestId,
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
        return;
      }

      try {
        const routed = await GestureIntentRouter.routeAndResolve(parseResult.data);

        if (routed.decision === 'IGNORE') {
          socket.emit('ai:ignored', {
            requestId: enriched.requestId,
            reason: routed.response.reason,
          });
          return;
        }

        if (routed.response.reason === 'Timeout') {
          socket.emit('ai:timeout', {
            requestId: enriched.requestId,
            stateVersion: enriched.stateVersion,
          });
          return;
        }

        socket.emit('ai:intent-result', routed.response);
      } catch (err: any) {
        logger.error({ err: err.message }, 'WebSocket AI intent inference failed');
        socket.emit('ai:error', {
          requestId: enriched.requestId,
          error: err.message || 'Processing failed',
        });
      }
    });
  }
}
