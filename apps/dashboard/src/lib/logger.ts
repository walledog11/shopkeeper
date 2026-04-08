import pino from 'pino';

const isPretty = process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY !== 'false';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isPretty && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, ignore: 'pid,hostname' },
    },
  }),
});

export default logger;
