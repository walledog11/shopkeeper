"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useIntegrations } from "@/hooks/useIntegrations";
import { fetcher } from "@/lib/api/fetcher";
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection";
import type { ImessageStatus } from "../_components/model";
import { selectOnboardingIntegrations } from "../_lib/onboarding-integrations";
import { useShopifyKnowledgeSync } from "./useShopifyKnowledgeSync";

export function useOnboardingIntegrationState(enabled: boolean) {
  const { data, mutate: refresh } = useIntegrations({
    enabled,
    refreshInterval: 3000,
  });
  const selected = useMemo(() => selectOnboardingIntegrations(data ?? []), [data]);

  const { data: imessageStatus, mutate: refreshImessage } = useSWR<ImessageStatus>(
    enabled ? "/api/integrations/imessage/bind" : null,
    fetcher,
  );

  const hasShopify = isShopifyIntegrationActive(selected.shopify);
  const kbSync = useShopifyKnowledgeSync(hasShopify ? selected.shopify?.id : undefined);

  return {
    ...selected,
    hasMessaging: Boolean(imessageStatus?.connected),
    hasShopify,
    imessageStatus,
    kbSync,
    refresh,
    refreshImessage,
  };
}
