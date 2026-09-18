import { buildApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Server listening on port ${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
