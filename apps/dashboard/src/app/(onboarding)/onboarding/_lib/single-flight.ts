export interface SingleFlightRef<T> {
  current: Promise<T> | null;
}

export function runSingleFlight<T>(
  ref: SingleFlightRef<T>,
  operation: () => Promise<T>,
): Promise<T> {
  if (ref.current) return ref.current;

  const running = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (ref.current === running) ref.current = null;
    });
  ref.current = running;
  return running;
}
