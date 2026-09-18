import pino from 'pino';
import { config } from '../config';

const VALID_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

export const logger = pino({
  level: VALID_LEVELS.includes(config.logLevel) ? config.logLevel : 'info',
});
