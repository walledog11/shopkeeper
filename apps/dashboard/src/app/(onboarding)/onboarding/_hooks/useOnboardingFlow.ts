"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useClerk, useOrganizationList, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { isApiRequestError } from "@/lib/api/fetcher";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useOAuthLauncher } from "@/hooks/useOAuthLauncher";
import { useOperatorChannels } from "@/hooks/useOperatorChannels";
import { isStorefrontChatEnabledForIntegration } from "@/lib/storefront-chat/enabled";
import {
  isOperationPending,
  operationError,
  useSingleFlightOperation,
  type OperationState,
} from "@/hooks/useSingleFlightOperation";
import { getOAuthIntegrationDefinition } from "@/lib/integrations/catalog";
import {
  OAUTH_ERROR_MESSAGES,
  type OAuthOutcome,
} from "@/lib/integrations/oauth-contract";
import { updateShopifyStorefrontChat } from "@/lib/integrations/requests";
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection";
import { captureClientProductEvent } from "@/lib/product-events";
import type { Integration } from "@/types";
import { RETURN_TO, STEPS, type StepId, type OnboardingData } from "../_lib/onboarding-model";
import { selectOnboardingIntegrations } from "../_lib/onboarding-integrations";
import {
  createForwardingEmail,
  persistOnboardingSettings,
  simulateShopifyIntegration,
  updateGmailSupportAddress,
  type OnboardingSettingsRequest,
} from "../_lib/onboarding-requests";
import { useOnboardingDraft } from "./useOnboardingDraft";
import { useOnboardingOrganization } from "./useOnboardingOrganization";
import { useShopifyKbSync } from "./useShopifyKbSync";

export type OnboardingOAuthProvider = "gmail" | "shopify" | "instagram";
export type OnboardingOAuthParameters = {
  gmail: Record<string, string | undefined>;
  shopify: { shop: string };
  instagram: Record<string, string | undefined>;
};
export type LaunchOnboardingOAuth = <TProvider extends OnboardingOAuthProvider>(
  provider: TProvider,
  params: OnboardingOAuthParameters[TProvider],
) => void;

function toOnboardingOAuthPending(
  provider: ReturnType<typeof useOAuthLauncher>["pendingProvider"],
): OnboardingOAuthProvider | null {
  if (provider === "gmail" || provider === "shopify" || provider === "instagram") return provider;
  return null;
}

const SETTINGS_ERROR = "Couldn't save your onboarding settings. Try again.";
function settingsError(error: unknown): string {
  return isApiRequestError(error, 403)
    ? "Only a workspace admin can finish setup. Ask your store owner to continue, or switch workspaces above."
    : SETTINGS_ERROR;
}
const EMAIL_ERROR = "Couldn't save that support address. Try again.";

function resolveBrowserTimezone(): string | undefined {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone?.trim() ? timezone : undefined;
  } catch {
    return undefined;
  }
}

function settingsBody(data: OnboardingData, complete: boolean): OnboardingSettingsRequest {
  const name = data.storeName.trim();
  const timezone = resolveBrowserTimezone();
  return {
    ...(name ? { name } : {}),
    settings: {
      autonomyTier: "guarded",
      autoExecuteMode: "off",
      ...(timezone ? { digestTimezone: timezone } : {}),
      ...(complete ? { onboardingCompletedAt: new Date().toISOString() } : {}),
    },
  };
}

export function useOnboardingFlow(
  pinnedStepIndex: number | null,
  oauthOutcome: OAuthOutcome | null = null,
  storefrontChatGloballyEnabled = false,
) {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const organizationList = useOrganizationList({ userMemberships: { infinite: false } });
  const { setActive, userMemberships } = organizationList;
  const {
    clerkLoaded,
    ensureOrganization,
    organization,
    organizationOperation,
    organizationReady,
  } = useOnboardingOrganization();

  const { data: integrationRows, mutate: refreshIntegrations } = useIntegrations({
    enabled: organizationReady,
    refreshInterval: 3000,
  });
  const selected = useMemo(() => selectOnboardingIntegrations(integrationRows ?? []), [integrationRows]);
  const { imessageBound: hasMessaging } = useOperatorChannels(organizationReady);
  const hasShopify = isShopifyIntegrationActive(selected.shopify);
  const kbSync = useShopifyKbSync(hasShopify ? selected.shopify?.id : undefined);

  const savedEmail = (selected.preferredEmail?.fromEmail ?? selected.preferredEmail?.externalAccountId)?.trim();
  const { advance, back: draftBack, go, clear: clearDraft, hydrated, data, idx, update } = useOnboardingDraft({
    userId: user?.id,
    organizationId: organization?.id,
    clerkLoaded,
    founderName: user?.firstName,
    organizationName: organization?.name,
    pinnedStepIndex,
    savedEmail,
  });

  const importedStoreName = selected.shopify?.fromEmail?.trim();
  useEffect(() => {
    if (hydrated && importedStoreName && importedStoreName !== data.storeName) update({ storeName: importedStoreName });
  }, [data.storeName, hydrated, importedStoreName, update]);

  const ensureOrgForDraft = useCallback(
    () => ensureOrganization(data.storeName || data.shopDomain.replace(/^https?:\/\//, "").split(".")[0] || "My store"),
    [data.storeName, data.shopDomain, ensureOrganization],
  );

  const { run: runSettings, state: settingsState } = useSingleFlightOperation(async () => {
    if (!await ensureOrgForDraft()) return false;
    await persistOnboardingSettings(settingsBody(data, false));
    return true;
  }, settingsError);

  const { run: runCompletion, state: completionState } = useSingleFlightOperation(async () => {
    if (!await ensureOrgForDraft()) return false;
    await persistOnboardingSettings(settingsBody(data, true));
    return true;
  }, settingsError);

  const { run: runEmail, state: emailState } = useSingleFlightOperation(async (
    value: string,
    provider: "gmail" | "postmark",
  ) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || !await ensureOrgForDraft()) return false;
    void captureClientProductEvent({ event: "integration_connection_started", platform: "email" });

    const integration = provider === "gmail" ? selected.gmail : selected.forwarding;
    if (provider === "gmail") {
      if (!integration) throw new Error("Reconnect Gmail before updating its support address.");
      await updateGmailSupportAddress(integration.id, normalized);
    } else {
      await createForwardingEmail(normalized);
    }

    update({
      primaryEmail: normalized,
      ...(provider === "gmail"
        ? { gmailEmail: normalized }
        : { forwardingEmail: normalized }),
    });
    await refreshIntegrations();
    return true;
  }, (error) => error instanceof Error && error.message.startsWith("Reconnect Gmail")
    ? error.message
    : EMAIL_ERROR);

  const { run: runShopifySimulation, state: shopifySimulationState } = useSingleFlightOperation(async () => {
    if (!await ensureOrgForDraft()) return false;
    await simulateShopifyIntegration();
    await refreshIntegrations();
    return true;
  }, "Couldn't connect the demo store. Try again.");

  const [settledOAuthState, setSettledOAuthState] = useState<OperationState>({ status: "idle" });
  const { launch, pendingProvider } = useOAuthLauncher({
    outcome: oauthOutcome,
    onOutcome: (nextOutcome) => {
      if (nextOutcome.status === "failed") {
        setSettledOAuthState({
          status: "failed",
          error: nextOutcome,
          message: OAUTH_ERROR_MESSAGES[nextOutcome.error],
        });
        return;
      }
      setSettledOAuthState({ status: "succeeded", result: undefined });
      void refreshIntegrations();
    },
  });

  const stepId = STEPS[idx].id;
  const oauthReturnTo = useMemo(() => {
    if (stepId === "shopify") return `${RETURN_TO}?step=shopify`;
    if (stepId === "email") return `${RETURN_TO}?step=email`;
    return RETURN_TO;
  }, [stepId]);

  const launchOAuth = useCallback<LaunchOnboardingOAuth>((provider, params) => {
    setSettledOAuthState({ status: "idle" });
    const definition = getOAuthIntegrationDefinition(provider);
    void launch({
      definition,
      params,
      readinessGuard: async () => await runSettings().catch(() => false),
      returnTo: oauthReturnTo,
      onClosed: () => { void refreshIntegrations(); },
      onLaunchError: (error) => {
        setSettledOAuthState({
          status: "failed",
          error,
          message: OAUTH_ERROR_MESSAGES.provider_unavailable,
        });
      },
    });
  }, [launch, oauthReturnTo, refreshIntegrations, runSettings]);

  const oauthState: OperationState = pendingProvider
    ? { status: "pending" }
    : settledOAuthState;

  const otherMembership = userMemberships?.data?.find(
    membership => membership.organization.id !== organization?.id,
  );
  const { run: runWorkspaceSwitch, state: workspaceSwitchState } = useSingleFlightOperation(async (organizationId: string) => {
    if (!setActive) throw new Error("Workspace switching is not ready.");
    await setActive({ organization: organizationId });
    clearDraft();
    router.push("/dashboard");
  }, "Couldn't switch workspaces. Try again.");
  const { run: runSignOut, state: signOutState } = useSingleFlightOperation(async () => {
    await signOut({ redirectUrl: "/login" });
    clearDraft();
  }, "Couldn't sign you out. Try again.");

  const exitAction = useCallback(async () => {
    if (otherMembership && setActive) {
      try { await runWorkspaceSwitch(otherMembership.organization.id); } catch {}
      return;
    }
    try { await runSignOut(); } catch {}
  }, [otherMembership, runSignOut, runWorkspaceSwitch, setActive]);

  const exit = useMemo(() => ({
    label: otherMembership && setActive
      ? `Back to ${otherMembership.organization.name}`
      : "Sign out",
    action: exitAction,
  }), [exitAction, otherMembership, setActive]);

  const exitState = otherMembership && setActive ? workspaceSwitchState : signOutState;

  const hasEmailReady = selected.emailReady;
  const hasInstagramReady = selected.instagramReady;
  const hasStorefrontChat = storefrontChatGloballyEnabled && hasShopify && isStorefrontChatEnabledForIntegration(selected.shopify?.metadata);
  const hasCustomerChannel = hasEmailReady || hasInstagramReady || hasStorefrontChat;

  const updateStorefrontChat = useCallback(async (enabled: boolean) => {
    try {
      await updateShopifyStorefrontChat(enabled);
      await refreshIntegrations();
      return true;
    } catch {
      return false;
    }
  }, [refreshIntegrations]);

  const canContinue = useMemo(() => {
    if (stepId === "shopify") return hasShopify;
    return true;
  }, [hasShopify, stepId]);

  const { run: runNext, state: nextState } = useSingleFlightOperation(async () => {
    if (!canContinue) return false;
    if (stepId === "shopify" && !await runSettings().catch(() => false)) return false;

    const analyticsStep = stepId;
    const completedOptionalStep = analyticsStep !== "email" || hasCustomerChannel;
    if (analyticsStep !== "plan" && analyticsStep !== "connect" && completedOptionalStep) {
      void captureClientProductEvent({ event: "onboarding_step_completed", step: analyticsStep });
    }
    advance();
    return true;
  }, "Couldn't continue onboarding. Try again.");

  const { run: runFinish, state: finishState } = useSingleFlightOperation(async () => {
    if (!hasShopify || !await runCompletion().catch(() => false)) return false;
    void captureClientProductEvent({ event: "onboarding_step_completed", step: "plan" });
    clearDraft();
    router.push("/dashboard");
    router.refresh();
    return true;
  }, "Couldn't finish onboarding. Try again.");

  const { run: runSimulation, state: simulationState } = useSingleFlightOperation(async () => {
    if (!await runShopifySimulation().catch(() => false)) return false;
    return true;
  }, "Couldn't connect the demo store. Try again.");

  const pending = [
    organizationOperation,
    settingsState,
    completionState,
    emailState,
    shopifySimulationState,
    nextState,
    finishState,
    simulationState,
    oauthState,
    exitState,
  ].some(isOperationPending);

  const next = useCallback(async () => {
    try { await runNext(); } catch {}
  }, [runNext]);

  const finish = useCallback(async () => {
    try { await runFinish(); } catch {}
  }, [runFinish]);

  const simulateShopify = useCallback(async (): Promise<boolean> => {
    try { return await runSimulation(); } catch { return false; }
  }, [runSimulation]);

  const saveEmail = useCallback(async (value: string, provider: "gmail" | "postmark") => {
    try { return await runEmail(value, provider); } catch { return false; }
  }, [runEmail]);

  const back = useCallback(() => {
    if (!pending) draftBack();
  }, [draftBack, pending]);

  useEffect(() => {
    if (stepId !== "connect" && stepId !== "email") return;
    void ensureOrgForDraft();
  }, [ensureOrgForDraft, stepId]);

  const relevantErrors = stepId === "shopify"
      ? [settingsState, oauthState, shopifySimulationState, organizationOperation, exitState]
      : stepId === "email"
        ? [emailState, settingsState, oauthState, organizationOperation, exitState]
        : stepId === "plan"
          ? [completionState, organizationOperation, exitState]
          : [organizationOperation, exitState];
  const error = relevantErrors.map(operationError).find(Boolean) ?? null;

  const orgPending = isOperationPending(organizationOperation);

  return {
    data,
    emailIntegrations: { forwarding: selected.forwarding, gmail: selected.gmail },
    exit,
    idx,
    kbSync,
    instagramRow: selected.instagram as Integration | undefined,
    shopifyRow: selected.shopify as Integration | undefined,
    handlers: {
      back,
      navigate: (id: StepId) => { if (!pending) go(STEPS.findIndex(step => step.id === id)); },
      ensureOrganization: ensureOrgForDraft,
      finish,
      launchOAuth,
      next,
      saveEmailIntegration: saveEmail,
      simulateShopify,
      update,
      updateStorefrontChat,
    },
    status: {
      hydrated,
      hasStorefrontChat,
      canContinue,
      controlsPending: pending,
      emailSaving: isOperationPending(emailState),
      error,
      exitPending: isOperationPending(exitState),
      hasCustomerChannel,
      hasEmailReady,
      hasInstagramReady,
      hasMessaging,
      hasShopify,
      oauthPendingProvider: toOnboardingOAuthPending(pendingProvider),
      orgEnsureFailed: organizationOperation.status === "failed",
      orgEnsuring: !clerkLoaded || orgPending,
      orgReady: organizationReady && !orgPending,
      saving: isOperationPending(nextState)
        || isOperationPending(finishState)
        || isOperationPending(settingsState)
        || isOperationPending(completionState)
        || orgPending,
      shopifySimulating: isOperationPending(simulationState)
        || isOperationPending(shopifySimulationState),
    },
    step: STEPS[idx],
  };
}
