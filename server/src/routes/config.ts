import { FastifyInstance } from 'fastify';
import { configService } from '../services/ConfigService';
import { GestureConfigSchema } from '../validation/schemas';

export async function configRoutes(app: FastifyInstance) {
  app.get('/api/config/gestures', async (request, reply) => {
    return configService.getConfig();
  });

  app.post('/api/config/gestures', async (request, reply) => {
    const parsed = GestureConfigSchema.parse(request.body);
    const updated = configService.updateConfig(parsed);
    // broadcast config:update to ws? (Optional, instruction just says POST -> update)
    if ((app as any).io) {
      (app as any).io.emit('config:update', updated);
    }
    return updated;
  });
}
