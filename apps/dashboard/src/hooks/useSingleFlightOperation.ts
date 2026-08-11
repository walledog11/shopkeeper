"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type OperationState<TResult = void> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "failed"; error: unknown; message: string }
  | { status: "succeeded"; result: TResult };

export function isOperationPending(state: OperationState<unknown>): boolean {
  return state.status === "pending";
}

export function operationError(state: OperationState<unknown>): string | null {
  return state.status === "failed" ? state.message : null;
}

export function useSingleFlightOperation<TArgs extends unknown[], TResult>(
  execute: (...args: TArgs) => Promise<TResult>,
  failureMessage: string | ((error: unknown) => string),
) {
  const executeRef = useRef(execute);
  executeRef.current = execute;
  const failureMessageRef = useRef(failureMessage);
  failureMessageRef.current = failureMessage;
  const mountedRef = useRef(true);
  const runningRef = useRef<Promise<TResult> | null>(null);
  const [state, setState] = useState<OperationState<TResult>>({ status: "idle" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback((...args: TArgs): Promise<TResult> => {
    if (runningRef.current) return runningRef.current;

    setState({ status: "pending" });
    const running = Promise.resolve()
      .then(() => executeRef.current(...args))
      .then((result) => {
        if (mountedRef.current) setState({ status: "succeeded", result });
        return result;
      })
      .catch((error: unknown) => {
        const configuredMessage = failureMessageRef.current;
        const message = typeof configuredMessage === "function"
          ? configuredMessage(error)
          : configuredMessage;
        if (mountedRef.current) setState({ status: "failed", error, message });
        throw error;
      })
      .finally(() => {
        if (runningRef.current === running) runningRef.current = null;
      });
    runningRef.current = running;
    return running;
  }, []);

  const reset = useCallback(() => {
    if (!runningRef.current) setState({ status: "idle" });
  }, []);

  return { reset, run, state };
}
