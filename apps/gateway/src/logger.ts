import pino from 'pino';
import { PINO_REDACT_PATHS, REDACTED } from './observability/redaction.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: PINO_REDACT_PATHS, censor: REDACTED },
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, ignore: 'pid,hostname' },
    },
  }),
});

export default logger;
