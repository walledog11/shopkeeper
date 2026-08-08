"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useIntegrations } from "@/hooks/useIntegrations";
import { fetcher } from "@/lib/api/fetcher";
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection";
import type {
  ImessageStatus,
  KbSyncState,
  TelegramStatus,
} from "../_components/model";
import { selectOnboardingIntegrations } from "../_lib/onboarding-integrations";

export function useOnboardingIntegrationState(enabled: boolean) {
  const { data, mutate: refresh } = useIntegrations({
    enabled,
    refreshInterval: 3000,
  });
  const selected = useMemo(() => selectOnboardingIntegrations(data ?? []), [data]);

  const { data: telegramStatus, mutate: refreshTelegram } = useSWR<TelegramStatus>(
    enabled ? "/api/integrations/telegram" : null,
    fetcher,
    { refreshInterval: (latest) => (latest?.connected ? 0 : 3000) },
  );
  const { data: imessageStatus, mutate: refreshImessage } = useSWR<ImessageStatus>(
    enabled ? "/api/integrations/imessage/bind" : null,
    fetcher,
    { refreshInterval: (latest) => (latest?.connected ? 0 : 3000) },
  );

  const hasShopify = isShopifyIntegrationActive(selected.shopify);
  const [kbSync, setKbSync] = useState<KbSyncState>({
    status: "idle",
    policies: 0,
    pages: 0,
  });
  const kbSyncStarted = useRef(false);

  useEffect(() => {
    if (!hasShopify || kbSyncStarted.current) return;
    kbSyncStarted.current = true;
    setKbSync((previous) => ({ ...previous, status: "syncing" }));
    void (async () => {
      try {
        const response = await fetch("/api/integrations/shopify/kb-sync", { method: "POST" });
        const body = await response.json() as {
          syncedPages?: number;
          syncedPolicies?: number;
        };
        if (!response.ok) throw new Error("sync failed");
        setKbSync({
          status: "done",
          pages: body.syncedPages ?? 0,
          policies: body.syncedPolicies ?? 0,
        });
      } catch {
        setKbSync({ status: "error", policies: 0, pages: 0 });
      }
    })();
  }, [hasShopify]);

  return {
    ...selected,
    hasMessaging: Boolean(telegramStatus?.connected || imessageStatus?.connected),
    hasShopify,
    imessageStatus,
    kbSync,
    refresh,
    refreshImessage,
    refreshTelegram,
    telegramStatus,
  };
}
