"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChannelBindingAttempt } from "@/lib/integrations/channel-binding-client";

const DEFAULT_POLL_INTERVAL_MS = 3_500;
const DEFAULT_MAX_POLL_INTERVAL_MS = 15_000;
const DEFAULT_MAX_REFRESH_FAILURES = 3;

export type ChannelBindingState =
  | { status: "idle" }
  | { status: "requesting" }
  | {
      status: "awaiting_connection";
      attempt: ChannelBindingAttempt;
      connectionCountAtStart: number;
    }
  | { status: "connected" }
  | { status: "expired"; message: string }
  | { status: "failed"; error: unknown; message: string };

interface UseChannelBindingAttemptOptions {
  connectionCount: number;
  requestBinding: (signal: AbortSignal) => Promise<ChannelBindingAttempt>;
  refreshStatus: () => unknown | Promise<unknown>;
  requestFailureMessage: string;
  refreshFailureMessage: string;
  expiredMessage?: string;
  pollIntervalMs?: number;
  maxPollIntervalMs?: number;
  maxRefreshFailures?: number;
  now?: () => number;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function channelBindingValue(state: ChannelBindingState): string | null {
  return state.status === "awaiting_connection" ? state.attempt.value : null;
}

export function channelBindingError(state: ChannelBindingState): string | null {
  return state.status === "failed" || state.status === "expired" ? state.message : null;
}

export function useChannelBindingAttempt({
  connectionCount,
  requestBinding,
  refreshStatus,
  requestFailureMessage,
  refreshFailureMessage,
  expiredMessage = "This connection code expired. Create a new one.",
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPollIntervalMs = DEFAULT_MAX_POLL_INTERVAL_MS,
  maxRefreshFailures = DEFAULT_MAX_REFRESH_FAILURES,
  now = Date.now,
}: UseChannelBindingAttemptOptions) {
  const [state, setState] = useState<ChannelBindingState>({ status: "idle" });
  const mountedRef = useRef(true);
  const runningRef = useRef<Promise<ChannelBindingAttempt | null> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const connectionCountRef = useRef(connectionCount);
  const requestBindingRef = useRef(requestBinding);
  const refreshStatusRef = useRef(refreshStatus);
  const nowRef = useRef(now);

  connectionCountRef.current = connectionCount;
  requestBindingRef.current = requestBinding;
  refreshStatusRef.current = refreshStatus;
  nowRef.current = now;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (
      state.status === "awaiting_connection"
      && connectionCount > state.connectionCountAtStart
    ) {
      setState({ status: "connected" });
    }
  }, [connectionCount, state]);

  useEffect(() => {
    if (state.status !== "awaiting_connection") return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshFailures = 0;

    const expire = () => {
      if (!stopped && mountedRef.current) {
        setState({ status: "expired", message: expiredMessage });
      }
    };

    const schedule = (delayMs: number) => {
      const remainingMs = state.attempt.expiresAt - nowRef.current();
      if (remainingMs <= 0) {
        expire();
        return;
      }
      timer = setTimeout(poll, Math.min(delayMs, remainingMs));
    };

    const poll = async () => {
      if (stopped) return;
      if (state.attempt.expiresAt <= nowRef.current()) {
        expire();
        return;
      }

      try {
        await refreshStatusRef.current();
        refreshFailures = 0;
        schedule(pollIntervalMs);
      } catch (error) {
        refreshFailures += 1;
        if (refreshFailures >= maxRefreshFailures) {
          if (mountedRef.current) {
            setState({ status: "failed", error, message: refreshFailureMessage });
          }
          return;
        }
        schedule(Math.min(
          pollIntervalMs * 2 ** refreshFailures,
          maxPollIntervalMs,
        ));
      }
    };

    schedule(pollIntervalMs);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [
    expiredMessage,
    maxPollIntervalMs,
    maxRefreshFailures,
    pollIntervalMs,
    refreshFailureMessage,
    state,
  ]);

  const start = useCallback((): Promise<ChannelBindingAttempt | null> => {
    if (runningRef.current) return runningRef.current;

    const controller = new AbortController();
    abortRef.current = controller;
    const connectionCountAtStart = connectionCountRef.current;
    setState({ status: "requesting" });

    const running = requestBindingRef.current(controller.signal)
      .then((attempt) => {
        if (mountedRef.current && !controller.signal.aborted) {
          setState({ status: "awaiting_connection", attempt, connectionCountAtStart });
        }
        return controller.signal.aborted ? null : attempt;
      })
      .catch((error: unknown) => {
        if (mountedRef.current && !controller.signal.aborted) {
          setState({
            status: "failed",
            error,
            message: errorMessage(error, requestFailureMessage),
          });
        }
        return null;
      })
      .finally(() => {
        if (runningRef.current === running) runningRef.current = null;
        if (abortRef.current === controller) abortRef.current = null;
      });

    runningRef.current = running;
    return running;
  }, [requestFailureMessage]);

  const reset = useCallback(() => {
    if (!runningRef.current) setState({ status: "idle" });
  }, []);

  return { reset, start, state };
}
