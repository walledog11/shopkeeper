export class InjectedPhaseFailure extends Error {
  constructor(public readonly phase: string) {
    super(`Injected failure at phase: ${phase}`);
    this.name = "InjectedPhaseFailure";
  }
}

export interface DeterministicBarrier {
  arrive(): Promise<void>;
  waitForArrivals(count?: number): Promise<void>;
  release(): void;
  readonly arrivals: number;
}

// Promise-driven barrier for concurrency tests: no sleeps, polling, or timing
// assumptions. Tests wait until every caller reaches the named phase, inspect
// state, then release them together.
export function createDeterministicBarrier(parties: number): DeterministicBarrier {
  if (!Number.isInteger(parties) || parties < 1) {
    throw new Error("Barrier parties must be a positive integer.");
  }
  let arrivals = 0;
  let released = false;
  let releaseBarrier!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const arrivalWaiters: Array<{ count: number; resolve: () => void }> = [];

  const notifyArrivalWaiters = () => {
    for (let index = arrivalWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = arrivalWaiters[index];
      if (arrivals >= waiter.count) {
        arrivalWaiters.splice(index, 1);
        waiter.resolve();
      }
    }
  };

  return {
    get arrivals() {
      return arrivals;
    },
    async arrive() {
      arrivals += 1;
      if (arrivals > parties) {
        throw new Error(`Barrier received more than ${parties} arrivals.`);
      }
      notifyArrivalWaiters();
      await releasePromise;
    },
    waitForArrivals(count = parties) {
      if (!Number.isInteger(count) || count < 1 || count > parties) {
        return Promise.reject(new Error(`Arrival target must be between 1 and ${parties}.`));
      }
      if (arrivals >= count) return Promise.resolve();
      return new Promise<void>((resolve) => arrivalWaiters.push({ count, resolve }));
    },
    release() {
      if (released) return;
      released = true;
      releaseBarrier();
    },
  };
}

export function createFailureInjector(phases: readonly string[]) {
  const remaining = new Set(phases);
  return {
    checkpoint(phase: string): void {
      if (!remaining.delete(phase)) return;
      throw new InjectedPhaseFailure(phase);
    },
    pending(): string[] {
      return [...remaining];
    },
  };
}
