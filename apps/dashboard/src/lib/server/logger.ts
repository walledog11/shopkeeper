import pino from 'pino';
import { installAgentLogger } from '@shopkeeper/agent/logger';
import { PINO_REDACT_PATHS, REDACTED } from '@shopkeeper/agent/observability';

const globalForLogger = globalThis as typeof globalThis & { shopkeeperLogger: pino.Logger | undefined };

function createLogger(): pino.Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: PINO_REDACT_PATHS, censor: REDACTED },
  });
}

const logger = globalForLogger.shopkeeperLogger ?? createLogger();
globalForLogger.shopkeeperLogger = logger;
installAgentLogger(logger);

export default logger;
