"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KbSyncState, KbSyncViewModel } from "../_lib/onboarding-model";
import { synchronizeShopifyKnowledge } from "../_lib/onboarding-requests";

const KB_SYNC_ERROR = "Couldn't read your Shopify store. Try again.";

export function useShopifyKbSync(integrationId: string | undefined): KbSyncViewModel {
  const [state, setState] = useState<KbSyncState>({ status: "idle" });
  const syncGenerationRef = useRef(0);
  const retriedRef = useRef(false);

  const runSync = useCallback((id: string, allowRetry: boolean) => {
    const generation = ++syncGenerationRef.current;
    retriedRef.current = allowRetry;
    setState({ status: "pending", integrationId: id });

    void synchronizeShopifyKnowledge()
      .then((result) => {
        if (generation !== syncGenerationRef.current) return;
        setState({
          status: "succeeded",
          integrationId: id,
          pages: result.syncedPages,
          policies: result.syncedPolicies,
        });
      })
      .catch((error: unknown) => {
        if (generation !== syncGenerationRef.current) return;
        setState({
          status: "failed",
          integrationId: id,
          error,
          message: KB_SYNC_ERROR,
          canRetry: !retriedRef.current,
        });
      });
  }, []);

  useEffect(() => {
    if (!integrationId) {
      syncGenerationRef.current += 1;
      setState({ status: "idle" });
      return;
    }
    retriedRef.current = false;
    runSync(integrationId, false);
  }, [integrationId, runSync]);

  const retry = useCallback(() => {
    if (!integrationId || state.status !== "failed" || !state.canRetry) return;
    runSync(integrationId, true);
  }, [integrationId, runSync, state]);

  return { ...state, retry } as KbSyncViewModel;
}
