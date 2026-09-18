import { FastifyInstance } from 'fastify';
import { preferencesService } from '../services/PreferencesService';
import { UserPreferencesSchema } from '../validation/schemas';

export async function preferencesRoutes(app: FastifyInstance) {
  app.get('/api/preferences/:sessionId', async (request: any, reply) => {
    const { sessionId } = request.params;
    return preferencesService.getPreferences(sessionId);
  });

  app.put('/api/preferences/:sessionId', async (request: any, reply) => {
    const { sessionId } = request.params;
    const parsed = UserPreferencesSchema.partial().parse(request.body);
    return preferencesService.updatePreferences(sessionId, parsed);
  });
}
