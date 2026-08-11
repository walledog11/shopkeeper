"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { OAuthIntegrationDefinition } from "@/lib/integrations/catalog";
import type { OAuthOutcome } from "@/lib/integrations/oauth-contract";
import {
  buildOAuthAuthUrl,
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
} from "@/lib/integrations/oauth-flow";
import { captureClientProductEvent } from "@/lib/product-events";

export type OAuthParameters = Record<string, string | undefined>;

export interface OAuthOutcomeContext {
  source: "popup" | "redirect";
  refresh: boolean;
}

export interface OAuthLaunchOptions<TParameters extends OAuthParameters = OAuthParameters> {
  definition: OAuthIntegrationDefinition;
  params: TParameters;
  returnTo: string;
  authPath?: string;
  readinessGuard?: () => boolean | Promise<boolean>;
  onClosed?: () => void;
  onLaunchError?: (error: unknown) => void;
}

interface ActiveLaunch {
  provider: OAuthIntegrationDefinition["id"];
  disposeWatcher?: () => void;
  onClosed?: () => void;
}

export function useOAuthLauncher({
  outcome,
  onOutcome,
}: {
  outcome?: OAuthOutcome | null;
  onOutcome?: (outcome: OAuthOutcome, context: OAuthOutcomeContext) => void;
} = {}) {
  const mountedRef = useRef(true);
  const activeRef = useRef<ActiveLaunch | null>(null);
  const [pendingProvider, setPendingProvider] = useState<OAuthIntegrationDefinition["id"] | null>(null);

  const finishActive = useCallback((notifyClosed: boolean) => {
    const active = activeRef.current;
    if (!active) return;
    active.disposeWatcher?.();
    activeRef.current = null;
    if (mountedRef.current) setPendingProvider(null);
    if (notifyClosed && mountedRef.current) active.onClosed?.();
  }, []);

  const handleOutcome = useEffectEvent((nextOutcome: OAuthOutcome, context: OAuthOutcomeContext) => {
    if (!mountedRef.current) return;
    onOutcome?.(nextOutcome, context);
    if (activeRef.current?.provider === nextOutcome.provider) finishActive(false);
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current?.disposeWatcher?.();
      activeRef.current = null;
    };
  }, []);

  useEffect(() => subscribeOAuthDone((payload) => {
    handleOutcome(payload.outcome, { source: "popup", refresh: true });
  }), []);

  useEffect(() => {
    if (outcome) handleOutcome(outcome, { source: "redirect", refresh: outcome.status === "connected" });
  }, [outcome]);

  const launch = useCallback(async <TParameters extends OAuthParameters>({
    authPath,
    definition,
    onClosed,
    onLaunchError,
    params,
    readinessGuard,
    returnTo,
  }: OAuthLaunchOptions<TParameters>): Promise<boolean> => {
    if (activeRef.current) return false;

    activeRef.current = { provider: definition.id, onClosed };
    setPendingProvider(definition.id);
    try {
      if (readinessGuard && !await readinessGuard()) {
        finishActive(false);
        return false;
      }

      const url = buildOAuthAuthUrl(authPath ?? definition.oauth.authPath, {
        ...params,
        returnTo,
      });
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform: definition.oauth.analyticsPlatform,
      });

      const launched = openOAuthPopup(url);
      if (launched.mode === "redirect") {
        finishActive(true);
        return true;
      }

      const disposeWatcher = watchOAuthPopup(launched.popup, () => finishActive(true));
      if (activeRef.current?.provider === definition.id) {
        activeRef.current.disposeWatcher = disposeWatcher;
      } else {
        disposeWatcher();
      }
      return true;
    } catch (error) {
      finishActive(false);
      onLaunchError?.(error);
      return false;
    }
  }, [finishActive]);

  return { launch, pendingProvider };
}
