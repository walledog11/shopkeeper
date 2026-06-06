import pino from 'pino';
import { installAgentLogger } from '@clerk/agent/logger';
import { PINO_REDACT_PATHS, REDACTED } from '../observability/redaction';

const globalForLogger = globalThis as typeof globalThis & { clerkLogger: pino.Logger | undefined };

function createLogger(): pino.Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: PINO_REDACT_PATHS, censor: REDACTED },
  });
}

const logger = globalForLogger.clerkLogger ?? createLogger();
globalForLogger.clerkLogger = logger;
installAgentLogger(logger);

export default logger;
