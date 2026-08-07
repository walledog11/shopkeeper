"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";
import { useIntegrations } from "@/hooks/useIntegrations";
import { fetcher } from "@/lib/api/fetcher";
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup";
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection";
import { captureClientProductEvent } from "@/lib/product-events";
import {
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
} from "@/lib/integrations/oauth-flow";
import {
  DEFAULT_DATA,
  STEPS,
  STORAGE_KEY,
  type IntegrationRow,
  type KbSyncState,
  type OnboardingData,
  type StepId,
} from "../_components/model";

function providerOf(integration: IntegrationRow): "gmail" | "postmark" {
  const metadata = integration.metadata;
  if (!metadata || typeof metadata !== "object" || !("provider" in metadata)) {
    return "postmark";
  }
  return metadata.provider === "gmail"
    ? metadata.provider
    : "postmark";
}

function resolveBrowserTimezone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.trim() ? tz : undefined;
  } catch {
    return undefined;
  }
}

// Saved progress lives in localStorage, which the server cannot read. Rendering
// the resumed step during the first render would hydrate a different step than
// the server sent and discard the whole wizard subtree, so the read happens on
// mount instead. The `?step=` half of the old initializer is resolved
// server-side and arrives as `pinnedStepIndex`.
function readStoredOnboardingState(): { data: Partial<OnboardingData>; idx: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingData & { idx: number }>;
    const savedIdx = typeof parsed.idx === "number"
      ? Math.min(STEPS.length - 1, Math.max(0, parsed.idx))
      : 0;
    return { data: parsed, idx: savedIdx };
  } catch {
    return null;
  }
}

interface OnboardingState {
  idx: number;
  data: OnboardingData;
  /** False until the mount-time localStorage read lands; gates persistence. */
  hydrated: boolean;
  saving: boolean;
  emailSaving: boolean;
  orgEnsuring: boolean;
  orgEnsureFailed: boolean;
  prefilledEmail: string | null;
}

type OnboardingAction =
  | { type: "hydrate"; data: OnboardingData; idx: number }
  | { type: "hydrateSkipped" }
  | { type: "patchData"; patch: Partial<OnboardingData> }
  | { type: "prefillEmail"; email: string }
  | { type: "setIdx"; idx: number }
  | { type: "setSaving"; saving: boolean }
  | { type: "setEmailSaving"; saving: boolean }
  | { type: "setOrgEnsuring"; ensuring: boolean }
  | { type: "setOrgEnsureFailed"; failed: boolean }
  | { type: "advance" }
  | { type: "back" };

function createInitialOnboardingState(pinnedStepIndex: number | null): OnboardingState {
  return {
    idx: pinnedStepIndex ?? 0,
    data: DEFAULT_DATA,
    hydrated: false,
    saving: false,
    emailSaving: false,
    orgEnsuring: false,
    orgEnsureFailed: false,
    prefilledEmail: null,
  };
}

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case "hydrate":
      return { ...state, data: action.data, idx: action.idx, hydrated: true };
    case "hydrateSkipped":
      return state.hydrated ? state : { ...state, hydrated: true };
    case "patchData":
      return { ...state, data: { ...state.data, ...action.patch } };
    case "prefillEmail":
      if (state.prefilledEmail === action.email) return state;
      return {
        ...state,
        prefilledEmail: action.email,
        data: state.data.primaryEmail.trim()
          ? state.data
          : { ...state.data, primaryEmail: action.email },
      };
    case "setIdx":
      return { ...state, idx: action.idx };
    case "setSaving":
      return { ...state, saving: action.saving };
    case "setEmailSaving":
      return { ...state, emailSaving: action.saving };
    case "setOrgEnsuring":
      return { ...state, orgEnsuring: action.ensuring };
    case "setOrgEnsureFailed":
      return { ...state, orgEnsureFailed: action.failed };
    case "advance":
      return { ...state, idx: Math.min(STEPS.length - 1, state.idx + 1) };
    case "back":
      return { ...state, idx: Math.max(0, state.idx - 1) };
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

  const [state, dispatch] = useReducer(onboardingReducer, pinnedStepIndex, createInitialOnboardingState);
  const { data, emailSaving, idx, orgEnsureFailed, orgEnsuring, saving } = state;
  const [shopifySimulating, setShopifySimulating] = useState(false);
  const orgCreationInFlight = useRef(false);
  const founderPrefillApplied = useRef(false);
  const storePrefillApplied = useRef(false);
  const hydrationStarted = useRef(false);

  // A `?step=` in the URL still wins over saved progress, exactly as it did when
  // both were read together — the server resolved it into `pinnedStepIndex`.
  useEffect(() => {
    if (hydrationStarted.current) return;
    hydrationStarted.current = true;
    const stored = readStoredOnboardingState();
    if (!stored) {
      dispatch({ type: "hydrateSkipped" });
      return;
    }
    dispatch({
      type: "hydrate",
      data: { ...DEFAULT_DATA, ...stored.data },
      idx: pinnedStepIndex ?? stored.idx,
    });
  }, [pinnedStepIndex]);

  // Both prefills wait for hydration: they only fill a blank field, and before
  // the saved state lands every field still looks blank, so running early would
  // overwrite the merchant's own answers with the Clerk values.
  useEffect(() => {
    if (!state.hydrated || founderPrefillApplied.current || !user?.firstName) return;
    founderPrefillApplied.current = true;
    if (!data.founderName.trim()) {
      dispatch({ type: "patchData", patch: { founderName: user.firstName } });
    }
  }, [data.founderName, state.hydrated, user?.firstName]);

  useEffect(() => {
    if (!state.hydrated || storePrefillApplied.current || !organization?.name) return;
    storePrefillApplied.current = true;
    if (!data.storeName.trim()) {
      dispatch({ type: "patchData", patch: { storeName: organization.name } });
    }
  }, [data.storeName, organization?.name, state.hydrated]);

  useEffect(() => {
    // Writing before the mount-time read lands would persist the defaults over
    // the merchant's saved progress.
    if (!state.hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, idx }));
    } catch {}
  }, [data, idx, state.hydrated]);

  const { data: integrationData, mutate: refreshIntegrations } = useIntegrations({
    enabled: !!organization,
    refreshInterval: 3000,
  });
  const rows = useMemo(() => integrationData ?? [], [integrationData]);
  const shopifyRow = rows.find(row => row.platform === "shopify");
  const emailRow = rows.find(row => row.platform === "email");
  const savedEmail = (emailRow?.fromEmail ?? emailRow?.externalAccountId)?.trim();

  useEffect(() => {
    if (savedEmail && state.prefilledEmail !== savedEmail) {
      dispatch({ type: "prefillEmail", email: savedEmail });
    }
  }, [savedEmail, state.prefilledEmail]);

  // Live operator-channel status: poll while the org exists and the channel is
  // still unlinked, then stop once connected. The connect step also reads these
  // keys, so SWR dedupes to a single request per endpoint.
  const { data: telegramStatus } = useSWR<{ connected: boolean }>(
    organization ? "/api/integrations/telegram" : null,
    fetcher,
    { refreshInterval: (latest) => (latest?.connected ? 0 : 3000) },
  );
  const { data: imessageStatus } = useSWR<{ connected: boolean }>(
    organization ? "/api/integrations/imessage/bind" : null,
    fetcher,
    { refreshInterval: (latest) => (latest?.connected ? 0 : 3000) },
  );
  const hasMessaging = Boolean(telegramStatus?.connected || imessageStatus?.connected);

  const hasShopify = isShopifyIntegrationActive(shopifyRow);

  // The instant Shopify connects, pull its policies and pages into Memory so the
  // agent can answer store questions on night one and the Shopify step can show
  // what it learned. Fires once per session.
  const [kbSync, setKbSync] = useState<KbSyncState>({ status: "idle", policies: 0, pages: 0 });
  const kbSyncStartedRef = useRef(false);
  useEffect(() => {
    if (!hasShopify || kbSyncStartedRef.current) return;
    kbSyncStartedRef.current = true;
    setKbSync((prev) => ({ ...prev, status: "syncing" }));
    void (async () => {
      try {
        const res = await fetch("/api/integrations/shopify/kb-sync", { method: "POST" });
        const body = await res.json() as { syncedPolicies?: number; syncedPages?: number };
        if (!res.ok) throw new Error("sync failed");
        setKbSync({ status: "done", policies: body.syncedPolicies ?? 0, pages: body.syncedPages ?? 0 });
      } catch {
        setKbSync({ status: "error", policies: 0, pages: 0 });
      }
    })();
  }, [hasShopify]);
  const hasEmailReady = isEmailIntegrationConfigured(emailRow);
  const storeBriefed = data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
  const isStepComplete = useCallback((step: StepId) => {
    if (step === "intro") return storeBriefed;
    if (step === "shopify") return hasShopify;
    if (step === "connect") return hasMessaging;
    if (step === "email") return hasEmailReady;
    return false;
  }, [storeBriefed, hasShopify, hasMessaging, hasEmailReady]);

  const update = useCallback((patch: Partial<OnboardingData>) => {
    dispatch({ type: "patchData", patch });
  }, []);

  const persistSettings = useCallback(async (
    options?: { markOnboardingComplete?: boolean },
  ): Promise<boolean> => {
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
      if (!response.ok) return false;

      if (user && firstName && firstName !== user.firstName) {
        await user.update({ firstName });
      }
      return true;
    } catch {
      return false;
    }
  }, [data, user]);

  const ensureOrganization = useCallback(async (): Promise<boolean> => {
    if (organization) {
      dispatch({ type: "setOrgEnsureFailed", failed: false });
      return true;
    }
    if (!createOrganization || !setActive || orgCreationInFlight.current) return false;

    const name = data.storeName.trim();
    if (!name) return false;
    orgCreationInFlight.current = true;
    dispatch({ type: "setOrgEnsuring", ensuring: true });
    dispatch({ type: "setOrgEnsureFailed", failed: false });
    try {
      const created = await createOrganization({ name });
      await setActive({ organization: created.id }).then(() => persistSettings());
      return true;
    } catch {
      dispatch({ type: "setOrgEnsureFailed", failed: true });
      return false;
    } finally {
      orgCreationInFlight.current = false;
      dispatch({ type: "setOrgEnsuring", ensuring: false });
    }
  }, [organization, createOrganization, setActive, data.storeName, persistSettings]);

  const saveEmailIntegration = useCallback(async (email: string): Promise<boolean> => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    dispatch({ type: "setEmailSaving", saving: true });
    try {
      const ready = await ensureOrganization();
      if (!ready) return false;
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform: "email",
      });
      const isOAuthEmail = emailRow && providerOf(emailRow) !== "postmark";
      const response = await fetch(
        isOAuthEmail ? `/api/integrations/${emailRow.id}` : "/api/integrations",
        {
          method: isOAuthEmail ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isOAuthEmail
            ? { fromEmail: normalized }
            : { platform: "email", externalAccountId: normalized }),
        },
      );
      if (!response.ok) return false;
      update({ primaryEmail: normalized });
      await refreshIntegrations();
      return true;
    } catch {
      return false;
    } finally {
      dispatch({ type: "setEmailSaving", saving: false });
    }
  }, [emailRow, ensureOrganization, refreshIntegrations, update]);

  const launchOAuth = useCallback(async (url: string) => {
    dispatch({ type: "setSaving", saving: true });
    const ready = await ensureOrganization();
    dispatch({ type: "setSaving", saving: false });
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
      dispatch({ type: "advance" });
      return true;
    } catch {
      return false;
    } finally {
      setShopifySimulating(false);
    }
  }, [ensureOrganization, refreshIntegrations]);

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
      dispatch({ type: "setSaving", saving: true });
      try {
        const ready = await ensureOrganization();
        if (!ready) return;
        const persisted = await persistSettings();
        if (!persisted) return;
      } finally {
        dispatch({ type: "setSaving", saving: false });
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
    dispatch({ type: "advance" });
  }, [canContinue, ensureOrganization, hasEmailReady, persistSettings, saving, stepId]);

  const advanceFromKeyboard = useEffectEvent(() => {
    void next();
  });

  const back = useCallback(() => {
    dispatch({ type: "back" });
  }, []);

  const finish = useCallback(async () => {
    dispatch({ type: "setSaving", saving: true });
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
      dispatch({ type: "setSaving", saving: false });
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.key !== "Enter"
        || event.shiftKey
        || event.metaKey
        || event.ctrlKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA" || stepId === "plan" || !canContinue) return;
      event.preventDefault();
      advanceFromKeyboard();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepId, canContinue]);

  const onGoto = useCallback((targetIdx: number) => {
    if (targetIdx <= idx || isStepComplete(STEPS[targetIdx].id)) {
      dispatch({ type: "setIdx", idx: targetIdx });
    }
  }, [idx, isStepComplete]);

  return {
    data,
    emailRow,
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
    isStepComplete,
    onGoto,
    shopifyRow,
    status: {
      canContinue,
      emailSaving,
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
