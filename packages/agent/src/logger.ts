// Minimal console-backed logger for the shared agent core. Mirrors the pino
// `(obj, msg)` call shape used across the codebase so moved modules log the
// same way. The host app may install its own logger via the runtime-deps seam
// in a later extraction step; until then failure-path warnings still surface.
type LogFn = (obj: unknown, msg?: string) => void;

const logger: { warn: LogFn; info: LogFn; error: LogFn; debug: LogFn } = {
  warn: (obj, msg) => console.warn(msg ?? "", obj),
  info: (obj, msg) => console.info(msg ?? "", obj),
  error: (obj, msg) => console.error(msg ?? "", obj),
  debug: (obj, msg) => console.debug(msg ?? "", obj),
};

export default logger;
