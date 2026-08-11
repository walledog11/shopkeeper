"use client";

import { useCallback } from "react";
import { captureClientProductEvent } from "@/lib/product-events";
import { useSingleFlightOperation } from "@/hooks/useSingleFlightOperation";
import type { Integration } from "@/types";
import type { OnboardingData } from "../_components/model";
import {
  createForwardingEmail,
  persistOnboardingSettings,
  simulateShopifyIntegration,
  updateGmailSupportAddress,
  type OnboardingSettingsRequest,
} from "../_lib/onboarding-requests";

const SETTINGS_ERROR = "Couldn't save your onboarding settings. Try again.";
const EMAIL_ERROR = "Couldn't save that support address. Try again.";

function resolveBrowserTimezone(): string | undefined {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone && timezone.trim() ? timezone : undefined;
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

interface OnboardingUser {
  firstName: string | null;
  update: (params: { firstName: string }) => Promise<unknown>;
}

async function updateFounderName(user: OnboardingUser | null | undefined, founderName: string) {
  const firstName = founderName.trim();
  if (user && firstName && firstName !== user.firstName) {
    await user.update({ firstName });
  }
}

export function useOnboardingMutations({
  data,
  ensureOrganization,
  forwarding,
  gmail,
  refreshIntegrations,
  update,
  user,
}: {
  data: OnboardingData;
  ensureOrganization: () => Promise<boolean>;
  forwarding: Integration | undefined;
  gmail: Integration | undefined;
  refreshIntegrations: () => unknown | Promise<unknown>;
  update: (patch: Partial<OnboardingData>) => void;
  user: OnboardingUser | null | undefined;
}) {
  const { run: runSettings, state: settingsState } = useSingleFlightOperation(async () => {
    if (!await ensureOrganization()) return false;
    await persistOnboardingSettings(settingsBody(data, false));
    await updateFounderName(user, data.founderName);
    return true;
  }, SETTINGS_ERROR);

  const { run: runCompletion, state: completionState } = useSingleFlightOperation(async () => {
    if (!await ensureOrganization()) return false;
    await persistOnboardingSettings(settingsBody(data, true));
    await updateFounderName(user, data.founderName);
    return true;
  }, SETTINGS_ERROR);

  const { run: runEmail, state: emailState } = useSingleFlightOperation(async (
    value: string,
    provider: "gmail" | "postmark",
  ) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || !await ensureOrganization()) return false;
    void captureClientProductEvent({ event: "integration_connection_started", platform: "email" });

    const integration = provider === "gmail" ? gmail : forwarding;
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
    if (!await ensureOrganization()) return false;
    await simulateShopifyIntegration();
    await refreshIntegrations();
    return true;
  }, "Couldn't connect the demo store. Try again.");

  const saveSettings = useCallback(async () => {
    try { return await runSettings(); } catch { return false; }
  }, [runSettings]);
  const completeOnboarding = useCallback(async () => {
    try { return await runCompletion(); } catch { return false; }
  }, [runCompletion]);
  const saveEmail = useCallback(async (value: string, provider: "gmail" | "postmark") => {
    try { return await runEmail(value, provider); } catch { return false; }
  }, [runEmail]);
  const simulateShopify = useCallback(async () => {
    try { return await runShopifySimulation(); } catch { return false; }
  }, [runShopifySimulation]);

  return {
    completeOnboarding,
    saveEmail,
    saveSettings,
    simulateShopify,
    states: {
      completion: completionState,
      email: emailState,
      settings: settingsState,
      shopifySimulation: shopifySimulationState,
    },
  };
}
