import { buildApp } from '../app';
import { FastifyInstance } from 'fastify';

describe('Config API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/config/gestures returns defaults', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/config/gestures'
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.swipe).toBeDefined();
  });

  it('POST /api/config/gestures updates and returns new config', async () => {
    const update = {
      swipe: { minVelocity: 2.0, confidence: 0.9 },
      pinch: { threshold: 0.5 },
      zoom: { minDelta: 0.2 },
      rotate: { minVelocity: 1.0 },
      deadZone: 0.1
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/config/gestures',
      payload: update
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.swipe.minVelocity).toBe(2.0);
  });
});
