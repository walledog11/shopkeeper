import pino from 'pino';

const globalForLogger = globalThis as unknown as { clerkLogger: pino.Logger | undefined };

const isPretty = process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY !== 'false';

function createLogger(): pino.Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    ...(isPretty && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname' },
      },
    }),
  });
}

const logger = globalForLogger.clerkLogger ?? createLogger();
globalForLogger.clerkLogger = logger;

export default logger;
