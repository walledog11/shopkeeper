export type AgentLogPayload = Record<string, unknown> | string;
export type AgentLogFn = (obj: AgentLogPayload, msg?: string) => void;

export interface AgentLogger {
  warn: AgentLogFn;
  info: AgentLogFn;
  error: AgentLogFn;
  debug: AgentLogFn;
}

function consoleLog(
  write: (message?: unknown, ...optionalParams: unknown[]) => void,
  obj: AgentLogPayload,
  msg?: string,
): void {
  if (typeof obj === "string") {
    write(obj);
    return;
  }

  if (msg) {
    write(msg, obj);
    return;
  }

  write(obj);
}

const consoleLogger: AgentLogger = {
  warn: (obj, msg) => consoleLog(console.warn, obj, msg),
  info: (obj, msg) => consoleLog(console.info, obj, msg),
  error: (obj, msg) => consoleLog(console.error, obj, msg),
  debug: (obj, msg) => consoleLog(console.debug, obj, msg),
};

let installedLogger: AgentLogger = consoleLogger;

export function installAgentLogger(logger: AgentLogger): void {
  installedLogger = logger;
}

export function resetAgentLoggerForTests(): void {
  installedLogger = consoleLogger;
}

const logger: AgentLogger = {
  warn: (obj, msg) => installedLogger.warn(obj, msg),
  info: (obj, msg) => installedLogger.info(obj, msg),
  error: (obj, msg) => installedLogger.error(obj, msg),
  debug: (obj, msg) => installedLogger.debug(obj, msg),
};

export default logger;
