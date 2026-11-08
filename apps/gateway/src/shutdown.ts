import { onShutdownSignals } from './shutdown-signals.js';

export interface ShutdownResource {
  label: string;
  close: () => void | Promise<void>;
}

export type Shutdown = (exitProcess?: boolean) => Promise<void>;

export interface ShutdownOptions {
  forceExitTimeoutMs?: number;
  exitProcess?: (code?: number) => unknown;
}

export async function closeShutdownResources(
  resources: ShutdownResource[],
  failures: unknown[],
  onFailure: (error: unknown, label: string | undefined) => void,
): Promise<void> {
  const results = await Promise.allSettled(resources.map(resource => Promise.resolve().then(() => resource.close())));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;
    failures.push(result.reason);
    onFailure(result.reason, resources[index]?.label);
  });
}

// The host controls cleanup order and force-close behavior. This owns the
// deadline, shared promise, and exactly-once exit even for a later exit request.
export function createGracefulShutdown(options: ShutdownOptions & {
  run: () => Promise<void>;
  onTimeout: (timeoutMs: number) => Error;
  onFailure: (error: unknown) => void;
}): Shutdown {
  const timeoutMs = options.forceExitTimeoutMs ?? 25_000;
  const exitProcess = options.exitProcess ?? process.exit;
  let shutdownPromise: Promise<void> | undefined;
  let exitRequested = false;
  let exitCode: number | undefined;
  let exitCalled = false;
  const requestExit = (code: number) => {
    exitCode = code;
    if (exitRequested && !exitCalled) {
      exitCalled = true;
      exitProcess(code);
    }
  };
  const run = () => {
    const gracefulShutdown = options.run();
    let deadline: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {
        const error = options.onTimeout(timeoutMs);
        requestExit(1);
        reject(error);
      }, timeoutMs);
      deadline.unref();
    });
    return Promise.race([gracefulShutdown, timedOut])
      .then(() => requestExit(0))
      .catch((error: unknown) => {
        options.onFailure(error);
        requestExit(1);
        if (!exitRequested) throw error;
      })
      .finally(() => clearTimeout(deadline));
  };
  return (shouldExitProcess = false) => {
    if (shouldExitProcess) {
      exitRequested = true;
      if (exitCode !== undefined) requestExit(exitCode);
    }
    shutdownPromise ??= run();
    return shutdownPromise;
  };
}

export function registerShutdownSignals(shutdown: Shutdown): () => void {
  return onShutdownSignals(() => { void shutdown(true); });
}
