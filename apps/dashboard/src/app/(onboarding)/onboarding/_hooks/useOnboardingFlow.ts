"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";
import { captureClientProductEvent } from "@/lib/product-events";
import {
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
} from "@/lib/integrations/oauth-flow";
import {
  STEPS,
  STORAGE_KEY,
} from "../_components/model";
import { runSingleFlight } from "../_lib/single-flight";
import { useOnboardingDraft } from "./useOnboardingDraft";
import { useOnboardingIntegrationState } from "./useOnboardingIntegrationState";

function resolveBrowserTimezone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.trim() ? tz : undefined;
  } catch {
    return undefined;
  }
}

export function useOnboardingFlow(pinnedStepIndex: number | null) {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { createOrganization, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  const [emailSaving, setEmailSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgEnsureFailed, setOrgEnsureFailed] = useState(false);
  const [orgEnsuring, setOrgEnsuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shopifySimulating, setShopifySimulating] = useState(false);
  const orgCreationPromise = useRef<Promise<boolean> | null>(null);
  const integrationState = useOnboardingIntegrationState(Boolean(organization));
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
  const { advance, back, data, idx, update } = useOnboardingDraft({
    founderName: user?.firstName,
    organizationName: organization?.name,
    pinnedStepIndex,
    savedEmail,
  });

  const persistSettings = useCallback(async (
    options?: { markOnboardingComplete?: boolean },
  ): Promise<boolean> => {
    setError(null);
    const name = data.storeName.trim();
    const firstName = data.founderName.trim();
    const timezone = resolveBrowserTimezone();
    const body: {
      name?: string;
      settings: {
        autonomyTier: "guarded";
        autoExecuteMode: "off";
        digestTimezone?: string;
        onboardingCompletedAt?: string;
      };
    } = {
      settings: {
        autonomyTier: "guarded",
        autoExecuteMode: "off",
        ...(timezone ? { digestTimezone: timezone } : {}),
        ...(options?.markOnboardingComplete && {
          onboardingCompletedAt: new Date().toISOString(),
        }),
      },
    };
    if (name) body.name = name;

    try {
      const response = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError("Couldn't save your onboarding settings. Try again.");
        return false;
      }

      if (user && firstName && firstName !== user.firstName) {
        await user.update({ firstName });
      }
      return true;
    } catch {
      setError("Couldn't save your onboarding settings. Try again.");
      return false;
    }
  }, [data, user]);

  const ensureOrganization = useCallback((): Promise<boolean> => {
    if (organization) {
      setOrgEnsureFailed(false);
      return Promise.resolve(true);
    }
    if (!createOrganization || !setActive) return Promise.resolve(false);

    const name = data.storeName.trim();
    if (!name) return Promise.resolve(false);

    return runSingleFlight(orgCreationPromise, async () => {
      setError(null);
      setOrgEnsuring(true);
      setOrgEnsureFailed(false);
      try {
        const created = await createOrganization({ name });
        await setActive({ organization: created.id });
        return true;
      } catch {
        setError("Couldn't prepare your workspace. Try again.");
        setOrgEnsureFailed(true);
        return false;
      } finally {
        setOrgEnsuring(false);
      }
    });
  }, [organization, createOrganization, setActive, data.storeName]);

  const saveEmailIntegration = useCallback(async (
    email: string,
    provider: "gmail" | "postmark",
  ): Promise<boolean> => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    setError(null);
    setEmailSaving(true);
    try {
      const ready = await ensureOrganization();
      if (!ready) return false;
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform: "email",
      });
      const integration = provider === "gmail" ? gmail : forwarding;
      if (provider === "gmail" && !integration) {
        setError("Reconnect Gmail before updating its support address.");
        return false;
      }
      const response = await fetch(
        provider === "gmail" ? `/api/integrations/${integration?.id}` : "/api/integrations",
        {
          method: provider === "gmail" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(provider === "gmail"
            ? { fromEmail: normalized }
            : { platform: "email", externalAccountId: normalized }),
        },
      );
      if (!response.ok) {
        setError("Couldn't save that support address. Try again.");
        return false;
      }
      update({
        primaryEmail: normalized,
        ...(provider === "gmail"
          ? { gmailEmail: normalized }
          : { forwardingEmail: normalized }),
      });
      await refreshIntegrations();
      return true;
    } catch {
      setError("Couldn't save that support address. Try again.");
      return false;
    } finally {
      setEmailSaving(false);
    }
  }, [ensureOrganization, forwarding, gmail, refreshIntegrations, update]);

  const launchOAuth = useCallback(async (url: string) => {
    setSaving(true);
    const ready = await ensureOrganization();
    setSaving(false);
    if (!ready) return;
    const platform = url.includes("/shopify/")
      ? "shopify"
      : url.includes("/gmail/")
        ? "email"
        : null;
    if (platform) {
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform,
      });
    }
    const popup = openOAuthPopup(url);
    if (!popup) return;
    watchOAuthPopup(popup, () => {
      void refreshIntegrations();
    });
  }, [ensureOrganization, refreshIntegrations]);

  const simulateShopify = useCallback(async (): Promise<boolean> => {
    setShopifySimulating(true);
    try {
      const ready = await ensureOrganization();
      if (!ready) return false;
      const response = await fetch("/api/integrations/shopify/simulate", {
        method: "POST",
      });
      if (!response.ok) return false;
      await refreshIntegrations();
      advance();
      return true;
    } catch {
      return false;
    } finally {
      setShopifySimulating(false);
    }
  }, [advance, ensureOrganization, refreshIntegrations]);

  const handleOAuthResult = useEffectEvent(() => {
    void refreshIntegrations();
  });

  useEffect(() => subscribeOAuthDone(() => handleOAuthResult()), []);

  const stepId = STEPS[idx].id;

  useEffect(() => {
    // The connect step's bind endpoints are org-scoped, so make sure the org
    // exists by the time the merchant lands there (and on email, as before).
    if (stepId !== "connect" && stepId !== "email") return;
    void ensureOrganization();
  }, [stepId, ensureOrganization]);

  const canContinue = useMemo(() => {
    if (stepId === "intro") {
      return data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
    }
    if (stepId === "shopify") return hasShopify;
    // Customer channels and phone linking are optional during onboarding.
    return true;
  }, [stepId, data, hasShopify]);

  const next = useCallback(async () => {
    if (!canContinue || saving) return;
    if (stepId === "intro") {
      setSaving(true);
      try {
        const ready = await ensureOrganization();
        if (!ready) return;
        const persisted = await persistSettings();
        if (!persisted) return;
      } finally {
        setSaving(false);
      }
    }
    const analyticsStep = stepId === "intro" ? "store" : stepId;
    const completedOptionalStep = analyticsStep !== "email" || hasEmailReady;
    if (analyticsStep !== "plan" && analyticsStep !== "connect" && completedOptionalStep) {
      void captureClientProductEvent({
        event: "onboarding_step_completed",
        step: analyticsStep,
      });
    }
    advance();
  }, [advance, canContinue, ensureOrganization, hasEmailReady, persistSettings, saving, stepId]);

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      const ready = await ensureOrganization();
      if (!ready || !hasShopify) return;

      const completed = await persistSettings({ markOnboardingComplete: true });
      if (!completed) return;

      void captureClientProductEvent({
        event: "onboarding_step_completed",
        step: "plan",
      });
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [
    ensureOrganization,
    hasShopify,
    persistSettings,
    router,
  ]);

  const otherMembership = userMemberships?.data?.find(
    membership => membership.organization.id !== organization?.id,
  );
  const exit = useMemo(() => {
    if (otherMembership && setActive) {
      const target = otherMembership;
      return {
        label: `Back to ${target.organization.name}`,
        action: async () => {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
          try {
            await setActive({ organization: target.organization.id });
          } catch {}
          router.push("/dashboard");
        },
      };
    }
    return {
      label: "Sign out",
      action: async () => {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
        await signOut({ redirectUrl: "/login" });
      },
    };
  }, [otherMembership, setActive, signOut, router]);

  return {
    data,
    emailIntegrations: {
      forwarding,
      gmail,
    },
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
      launchOAuth,
      next,
      saveEmailIntegration,
      simulateShopify,
      update,
    },
    idx,
    shopifyRow,
    status: {
      canContinue,
      emailSaving,
      error,
      hasEmailReady,
      hasMessaging,
      hasShopify,
      orgEnsureFailed,
      orgEnsuring,
      orgReady: !!organization && !orgEnsuring && !orgEnsureFailed,
      saving,
      shopifySimulating,
    },
    step: STEPS[idx],
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
