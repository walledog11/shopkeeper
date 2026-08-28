import type { OpsAlertCounterClient, OpsAlertLogger } from "../observability/ops-alerts.js";

/**
 * Scaffolding every ops-alert threshold test needs, in one place instead of the
 * nine near-identical copies the two apps carried.
 *
 * Deliberately free of any vitest import — this file is built into `dist`, so
 * the package must not pull a test runner into its runtime graph. Both helpers
 * record into plain arrays, which assert as well as spies do here.
 */

export interface OpsAlertCounterHarness {
  client: OpsAlertCounterClient;
  /** Every `expire(key, seconds)` the code under test issued, in order. */
  expireCalls: Array<[string, number]>;
}

/** In-memory fixed-window counter: same key, monotonically increasing count. */
export function createOpsAlertCounterClient(): OpsAlertCounterHarness {
  const counts = new Map<string, number>();
  const expireCalls: Array<[string, number]> = [];

  return {
    client: {
      incr: async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      expire: async (key: string, seconds: number) => {
        expireCalls.push([key, seconds]);
      },
    },
    expireCalls,
  };
}

// The logger *method* that was called, not OpsAlertSeverity — the engine maps
// severity "warning" onto logger.warn, and tests assert on the method.
export type RecordedAlertLevel = "info" | "warn" | "error";

export interface RecordedAlertLog {
  level: RecordedAlertLevel;
  fields: Record<string, unknown>;
  message: string;
}

export interface OpsAlertLoggerHarness {
  logger: OpsAlertLogger;
  calls: RecordedAlertLog[];
}

/** An `OpsAlertLogger` that appends every write to `calls`. */
export function createOpsAlertRecordingLogger(): OpsAlertLoggerHarness {
  const calls: RecordedAlertLog[] = [];

  return {
    logger: {
      info: (fields, message) => calls.push({ level: "info", fields, message }),
      warn: (fields, message) => calls.push({ level: "warn", fields, message }),
      error: (fields, message) => calls.push({ level: "error", fields, message }),
    },
    calls,
  };
}
