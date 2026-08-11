"use client";

import { useCallback, useState } from "react";
import { getOAuthIntegrationDefinition } from "@/lib/integrations/catalog";
import {
  OAUTH_ERROR_MESSAGES,
  type OAuthOutcome,
} from "@/lib/integrations/oauth-contract";
import { useOAuthLauncher } from "@/hooks/useOAuthLauncher";
import type { OperationState } from "@/hooks/useSingleFlightOperation";
import { RETURN_TO } from "../_components/model";

export type OnboardingOAuthProvider = "gmail" | "shopify";
export type OnboardingOAuthParameters = {
  gmail: Record<string, string | undefined>;
  shopify: { shop: string };
};

export type LaunchOnboardingOAuth = <TProvider extends OnboardingOAuthProvider>(
  provider: TProvider,
  params: OnboardingOAuthParameters[TProvider],
) => void;

export function useOnboardingOAuth({
  ensureOrganization,
  outcome,
  refreshIntegrations,
}: {
  ensureOrganization: () => Promise<boolean>;
  outcome: OAuthOutcome | null;
  refreshIntegrations: () => unknown | Promise<unknown>;
}) {
  const [settledState, setSettledState] = useState<OperationState>({ status: "idle" });
  const { launch, pendingProvider } = useOAuthLauncher({
    outcome,
    onOutcome: (nextOutcome) => {
      if (nextOutcome.status === "failed") {
        setSettledState({
          status: "failed",
          error: nextOutcome,
          message: OAUTH_ERROR_MESSAGES[nextOutcome.error],
        });
        return;
      }
      setSettledState({ status: "succeeded", result: undefined });
      void refreshIntegrations();
    },
  });

  const launchOAuth = useCallback(<TProvider extends OnboardingOAuthProvider>(
    provider: TProvider,
    params: OnboardingOAuthParameters[TProvider],
  ) => {
    setSettledState({ status: "idle" });
    const definition = getOAuthIntegrationDefinition(provider);
    void launch({
      definition,
      params,
      readinessGuard: ensureOrganization,
      returnTo: RETURN_TO,
      onClosed: () => { void refreshIntegrations(); },
      onLaunchError: (error) => {
        setSettledState({
          status: "failed",
          error,
          message: OAUTH_ERROR_MESSAGES.provider_unavailable,
        });
      },
    });
  }, [ensureOrganization, launch, refreshIntegrations]);

  const state: OperationState = pendingProvider
    ? { status: "pending" }
    : settledState;

  return { launchOAuth: launchOAuth as LaunchOnboardingOAuth, pendingProvider, state };
}
