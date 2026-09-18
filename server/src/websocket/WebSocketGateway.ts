import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { sessionService } from '../services/SessionService';
import { gestureEventService } from '../services/GestureEventService';
import { telemetryService } from '../services/TelemetryService';
import { geminiService } from '../ai/GeminiService';
import { GestureEvent, AIRequest } from '../models/types';
import { logger } from '../utils/logger';
import { config } from '../config';
import { AIWebSocketHandler } from './AIWebSocketHandler';

export function setupWebSocket(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');
    
    let currentSessionId: string | null = null;

    socket.on('session:start', (data: { deviceType: string }) => {
      const session = sessionService.createSession(data?.deviceType || 'unknown');
      currentSessionId = session.id;
      socket.emit('session:ack', { sessionId: session.id });
    });

    socket.on('session:end', () => {
      if (currentSessionId) {
        sessionService.endSession(currentSessionId);
        currentSessionId = null;
      }
    });

    socket.on('gesture:event', (event: GestureEvent) => {
      if (!currentSessionId) return;
      gestureEventService.processGestureEvent(currentSessionId, event);
    });

    // New AI Intent pipeline
    AIWebSocketHandler.registerHandlers(socket, () => currentSessionId);

    socket.on('ai:request', async (request: AIRequest) => {
      if (!currentSessionId) return;
      const response = await geminiService.inferGestureIntent({
        sessionId: currentSessionId,
        uiState: request.uiState,
        activeCard: request.activeObject || undefined,
        hand: (request.hand as any) || 'RIGHT',
        trackingConfidence: request.gestureConfidence,
        gesture: {
          candidate: request.recentGestures?.[0] || 'UNKNOWN',
          confidence: request.gestureConfidence,
          velocity: { x: 0, y: 0, z: 0 },
          duration: 0
        },
        recentGestures: request.recentGestures || [],
        timestamp: Date.now()
      });
      socket.emit('ai:response', response);
    });

    socket.on('disconnect', () => {
      if (currentSessionId) {
        telemetryService.logWebSocketReconnect(currentSessionId);
      }
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });

  app.decorate('io', io);
}
