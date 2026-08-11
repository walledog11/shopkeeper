"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KbSyncState, KbSyncViewModel } from "../_components/model";
import { synchronizeShopifyKnowledge } from "../_lib/onboarding-requests";

const KB_SYNC_ERROR = "Couldn't read your Shopify store. Try again.";

export function useShopifyKnowledgeSync(integrationId: string | undefined): KbSyncViewModel {
  const [state, setState] = useState<KbSyncState>({ status: "idle" });
  const stateRef = useRef<KbSyncState>(state);
  const activeIntegrationIdRef = useRef(integrationId);
  activeIntegrationIdRef.current = integrationId;
  const mountedRef = useRef(true);
  const startedIdsRef = useRef(new Set<string>());
  const retriedIdsRef = useRef(new Set<string>());
  const cachedStatesRef = useRef(new Map<string, KbSyncState>());
  const inFlightRef = useRef(new Map<string, Promise<void>>());

  const publish = useCallback((nextState: KbSyncState) => {
    stateRef.current = nextState;
    if (nextState.status !== "idle") {
      cachedStatesRef.current.set(nextState.integrationId, nextState);
    }
    if (mountedRef.current) setState(nextState);
  }, []);

  const synchronize = useCallback((id: string, retry: boolean): Promise<void> => {
    const existing = inFlightRef.current.get(id);
    if (existing) return existing;
    if (retry) {
      const current = cachedStatesRef.current.get(id);
      if (current?.status !== "failed" || !current.canRetry) return Promise.resolve();
      retriedIdsRef.current.add(id);
    } else {
      if (startedIdsRef.current.has(id)) return Promise.resolve();
      startedIdsRef.current.add(id);
    }

    const pending: KbSyncState = { status: "pending", integrationId: id };
    cachedStatesRef.current.set(id, pending);
    if (activeIntegrationIdRef.current === id) publish(pending);

    const request = synchronizeShopifyKnowledge()
      .then((result) => {
        const succeeded: KbSyncState = {
          status: "succeeded",
          integrationId: id,
          pages: result.syncedPages,
          policies: result.syncedPolicies,
        };
        cachedStatesRef.current.set(id, succeeded);
        if (activeIntegrationIdRef.current === id) publish(succeeded);
      })
      .catch((error: unknown) => {
        const failed: KbSyncState = {
          status: "failed",
          integrationId: id,
          error,
          message: KB_SYNC_ERROR,
          canRetry: !retriedIdsRef.current.has(id),
        };
        cachedStatesRef.current.set(id, failed);
        if (activeIntegrationIdRef.current === id) publish(failed);
      })
      .finally(() => {
        if (inFlightRef.current.get(id) === request) inFlightRef.current.delete(id);
      });
    inFlightRef.current.set(id, request);
    return request;
  }, [publish]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!integrationId) {
      publish({ status: "idle" });
      return;
    }
    const cached = cachedStatesRef.current.get(integrationId);
    if (cached) publish(cached);
    void synchronize(integrationId, false);
  }, [integrationId, publish, synchronize]);

  const retry = useCallback(() => {
    const id = activeIntegrationIdRef.current;
    if (!id) return;
    void synchronize(id, true);
  }, [synchronize]);

  return { ...state, retry } as KbSyncViewModel;
}
