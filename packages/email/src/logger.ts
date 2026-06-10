export type EmailLogPayload = Record<string, unknown> | string;
export type EmailLogFn = (obj: EmailLogPayload, msg?: string) => void;

export interface EmailLogger {
  warn: EmailLogFn;
  info: EmailLogFn;
  error: EmailLogFn;
  debug: EmailLogFn;
}

function consoleLog(
  write: (message?: unknown, ...optionalParams: unknown[]) => void,
  obj: EmailLogPayload,
  msg?: string,
): void {
  if (typeof obj === 'string') {
    write(obj);
    return;
  }
  if (msg) {
    write(msg, obj);
    return;
  }
  write(obj);
}

const consoleLogger: EmailLogger = {
  warn: (obj, msg) => consoleLog(console.warn, obj, msg),
  info: (obj, msg) => consoleLog(console.info, obj, msg),
  error: (obj, msg) => consoleLog(console.error, obj, msg),
  debug: (obj, msg) => consoleLog(console.debug, obj, msg),
};

let installedLogger: EmailLogger = consoleLogger;

export function installEmailLogger(logger: EmailLogger): void {
  installedLogger = logger;
}

export function getEmailLogger(): EmailLogger {
  return installedLogger;
}
