import { buildApp } from '../app';
import { FastifyInstance } from 'fastify';
import { io as Client } from 'socket.io-client';
import { sessionService } from '../services/SessionService';

describe('WebSocketGateway', () => {
  let app: FastifyInstance;
  let clientSocket: any;
  let port: number;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    port = (app.server.address() as any).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach((done) => {
    clientSocket = Client(`http://localhost:${port}`);
    clientSocket.on('connect', done);
  });

  afterEach(() => {
    clientSocket.disconnect();
  });

  it('session:start emits session:ack', (done) => {
    clientSocket.emit('session:start', { deviceType: 'test' });
    clientSocket.on('session:ack', (data: any) => {
      expect(data.sessionId).toBeDefined();
      expect(sessionService.getSession(data.sessionId)).toBeDefined();
      done();
    });
  });

  it('gesture:event updates session stats', (done) => {
    clientSocket.emit('session:start', { deviceType: 'test' });
    clientSocket.on('session:ack', (data: any) => {
      clientSocket.emit('gesture:event', {
        type: 'swipe',
        gesture: 'swipe_left',
        confidence: 0.9,
        velocity: 1.2,
        hand: 'RIGHT',
        duration: 100,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        const session = sessionService.getSession(data.sessionId);
        expect(session?.gestureCount).toBe(1);
        done();
      }, 100);
    });
  });
});
