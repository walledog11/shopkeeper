"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { captureClientProductEvent } from "@/lib/product-events";
import {
  isOperationPending,
  operationError,
  useSingleFlightOperation,
} from "@/hooks/useSingleFlightOperation";
import type { OAuthOutcome } from "@/lib/integrations/oauth-contract";
import { STEPS, STORAGE_KEY } from "../_components/model";
import { useOnboardingDraft } from "./useOnboardingDraft";
import { useOnboardingExit } from "./useOnboardingExit";
import { useOnboardingIntegrationState } from "./useOnboardingIntegrationState";
import { useOnboardingMutations } from "./useOnboardingMutations";
import { useOnboardingOAuth } from "./useOnboardingOAuth";
import { useOnboardingOrganization } from "./useOnboardingOrganization";

function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function useOnboardingFlow(
  pinnedStepIndex: number | null,
  oauthOutcome: OAuthOutcome | null = null,
) {
  const router = useRouter();
  const { user } = useUser();
  const organizationController = useOnboardingOrganization();
  const {
    clerkLoaded,
    ensureOrganization: ensureOrganizationForStore,
    operation: organizationOperation,
    organization,
    setActive,
    userMemberships,
  } = organizationController;
  const organizationReady = Boolean(organization)
    || (organizationOperation.status === "succeeded" && organizationOperation.result);
  const integrationState = useOnboardingIntegrationState(organizationReady);
  const {
    emailReady: hasEmailReady,
    forwarding,
    gmail,
    hasMessaging,
    hasShopify,
    imessageStatus,
    kbSync,
    preferredEmail,
    refresh: refreshIntegrations,
    refreshImessage,
    refreshTelegram,
    shopify: shopifyRow,
    telegramStatus,
  } = integrationState;
  const savedEmail = (preferredEmail?.fromEmail ?? preferredEmail?.externalAccountId)?.trim();
  const { advance, back: draftBack, data, idx, update } = useOnboardingDraft({
    founderName: user?.firstName,
    organizationName: organization?.name,
    pinnedStepIndex,
    savedEmail,
  });

  const ensureOrganization = useCallback(
    () => ensureOrganizationForStore(data.storeName),
    [data.storeName, ensureOrganizationForStore],
  );
  const mutations = useOnboardingMutations({
    data,
    ensureOrganization,
    forwarding,
    gmail,
    refreshIntegrations,
    update,
    user,
  });
  const oauth = useOnboardingOAuth({
    ensureOrganization,
    outcome: oauthOutcome,
    refreshIntegrations,
  });
  const { exit, state: exitState } = useOnboardingExit({
    activeOrganizationId: organization?.id,
    memberships: userMemberships?.data,
    setActive,
  });

  const stepId = STEPS[idx].id;
  const canContinue = useMemo(() => {
    if (stepId === "intro") {
      return data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
    }
    if (stepId === "shopify") return hasShopify;
    return true;
  }, [data.founderName, data.storeName, hasShopify, stepId]);

  const { run: runNext, state: nextState } = useSingleFlightOperation(async () => {
    if (!canContinue) return false;
    if (stepId === "intro" && !await mutations.saveSettings()) return false;

    const analyticsStep = stepId === "intro" ? "store" : stepId;
    const completedOptionalStep = analyticsStep !== "email" || hasEmailReady;
    if (analyticsStep !== "plan" && analyticsStep !== "connect" && completedOptionalStep) {
      void captureClientProductEvent({ event: "onboarding_step_completed", step: analyticsStep });
    }
    advance();
    return true;
  }, "Couldn't continue onboarding. Try again.");

  const { run: runFinish, state: finishState } = useSingleFlightOperation(async () => {
    if (!hasShopify || !await mutations.completeOnboarding()) return false;
    void captureClientProductEvent({ event: "onboarding_step_completed", step: "plan" });
    clearDraft();
    router.push("/dashboard");
    router.refresh();
    return true;
  }, "Couldn't finish onboarding. Try again.");

  const { run: runSimulation, state: simulationState } = useSingleFlightOperation(async () => {
    if (!await mutations.simulateShopify()) return false;
    advance();
    return true;
  }, "Couldn't connect the demo store. Try again.");

  const pending = [
    organizationOperation,
    mutations.states.settings,
    mutations.states.completion,
    mutations.states.email,
    mutations.states.shopifySimulation,
    nextState,
    finishState,
    simulationState,
    oauth.state,
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
  const back = useCallback(() => {
    if (!pending) draftBack();
  }, [draftBack, pending]);

  useEffect(() => {
    if (stepId !== "connect" && stepId !== "email") return;
    void ensureOrganization();
  }, [ensureOrganization, stepId]);

  const relevantErrors = stepId === "intro"
    ? [mutations.states.settings, organizationOperation, exitState]
    : stepId === "shopify"
      ? [oauth.state, mutations.states.shopifySimulation, organizationOperation, exitState]
      : stepId === "email"
        ? [mutations.states.email, oauth.state, organizationOperation, exitState]
        : stepId === "plan"
          ? [mutations.states.completion, organizationOperation, exitState]
          : [organizationOperation, exitState];
  const error = relevantErrors.map(operationError).find(Boolean) ?? null;

  const orgPending = isOperationPending(organizationOperation);
  const emailSaving = isOperationPending(mutations.states.email);
  const shopifySimulating = isOperationPending(simulationState)
    || isOperationPending(mutations.states.shopifySimulation);
  const saving = isOperationPending(nextState)
    || isOperationPending(finishState)
    || isOperationPending(mutations.states.settings)
    || isOperationPending(mutations.states.completion)
    || orgPending;

  return {
    data,
    emailIntegrations: { forwarding, gmail },
    messaging: {
      imessageStatus,
      refreshImessage,
      refreshTelegram,
      telegramStatus,
    },
    exit,
    kbSync,
    handlers: {
      back,
      ensureOrganization,
      finish,
      launchOAuth: oauth.launchOAuth,
      next,
      saveEmailIntegration: mutations.saveEmail,
      simulateShopify,
      update,
    },
    idx,
    shopifyRow,
    status: {
      canContinue,
      controlsPending: pending,
      emailSaving,
      error,
      exitPending: isOperationPending(exitState),
      hasEmailReady,
      hasMessaging,
      hasShopify,
      oauthPendingProvider: oauth.pendingProvider,
      orgEnsureFailed: organizationOperation.status === "failed",
      orgEnsuring: !clerkLoaded || orgPending,
      orgReady: organizationReady && !orgPending,
      saving,
      shopifySimulating,
    },
    step: STEPS[idx],
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
