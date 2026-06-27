"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";
import { useIntegrations } from "@/hooks/useIntegrations";
import {
  countOnboardingEssentials,
  isEmailIntegrationConfigured,
  resolveOnboardingStepIndex,
  type OnboardingResumeStep,
} from "@/lib/integrations/onboarding-setup";
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection";
import {
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
} from "@/lib/integrations/oauth-flow";
import {
  DEFAULT_DATA,
  STEPS,
  STORAGE_KEY,
  type OnboardingData,
  type StepId,
} from "../_components/model";

function readStepParam(): OnboardingResumeStep | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("step");
  if (value === "shopify" || value === "email" || value === "plan") return value;
  return null;
}

function readInitialOnboardingState() {
  if (typeof window === "undefined") return { data: DEFAULT_DATA, idx: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stepParam = readStepParam();
    if (!raw) {
      return {
        data: DEFAULT_DATA,
        idx: resolveOnboardingStepIndex(stepParam, 0, STEPS.map(step => step.id)),
      };
    }
    const parsed = JSON.parse(raw) as Partial<OnboardingData & { idx: number }>;
    const savedIdx = typeof parsed.idx === "number"
      ? Math.min(STEPS.length - 1, Math.max(0, parsed.idx))
      : 0;
    return {
      data: { ...DEFAULT_DATA, ...parsed },
      idx: resolveOnboardingStepIndex(stepParam, savedIdx, STEPS.map(step => step.id)),
    };
  } catch {
    return { data: DEFAULT_DATA, idx: 0 };
  }
}

interface OnboardingState {
  idx: number;
  data: OnboardingData;
  saving: boolean;
  emailSaving: boolean;
  orgEnsuring: boolean;
  orgEnsureFailed: boolean;
  prefilledEmail: string | null;
}

type OnboardingAction =
  | { type: "patchData"; patch: Partial<OnboardingData> }
  | { type: "prefillEmail"; email: string }
  | { type: "setIdx"; idx: number }
  | { type: "setSaving"; saving: boolean }
  | { type: "setEmailSaving"; saving: boolean }
  | { type: "setOrgEnsuring"; ensuring: boolean }
  | { type: "setOrgEnsureFailed"; failed: boolean }
  | { type: "advance" }
  | { type: "back" };

function createInitialOnboardingState(): OnboardingState {
  const initial = readInitialOnboardingState();
  return {
    idx: initial.idx,
    data: initial.data,
    saving: false,
    emailSaving: false,
    orgEnsuring: false,
    orgEnsureFailed: false,
    prefilledEmail: null,
  };
}

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
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

export function useOnboardingFlow() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { createOrganization, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  const [state, dispatch] = useReducer(onboardingReducer, undefined, createInitialOnboardingState);
  const { data, emailSaving, idx, orgEnsureFailed, orgEnsuring, saving } = state;
  const orgCreationInFlight = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, idx }));
    } catch {}
  }, [data, idx]);

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

  const hasShopify = isShopifyIntegrationActive(shopifyRow);
  const hasEmailReady = isEmailIntegrationConfigured(emailRow);
  const storeBriefed = data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
  const essentialsDone = countOnboardingEssentials({
    storeBriefed,
    hasShopify,
    hasEmail: hasEmailReady,
  });

  const isStepComplete = useCallback((step: StepId) => {
    if (step === "intro") return idx > 0;
    if (step === "store") return storeBriefed;
    if (step === "shopify") return hasShopify;
    if (step === "email") return hasEmailReady;
    if (step === "autonomy") return idx > STEPS.findIndex(item => item.id === "autonomy");
    return false;
  }, [idx, storeBriefed, hasShopify, hasEmailReady]);

  const update = useCallback((patch: Partial<OnboardingData>) => {
    dispatch({ type: "patchData", patch });
  }, []);

  const persistSettings = useCallback(async (
    options?: { markOnboardingComplete?: boolean },
  ): Promise<boolean> => {
    const name = data.storeName.trim();
    const aiContext = data.sells.trim();
    const firstName = data.founderName.trim();
    const body: {
      name?: string;
      settings: {
        aiContext: string;
        autonomyTier: OnboardingData["autonomy"];
        onboardingCompletedAt?: string;
      };
    } = {
      settings: {
        aiContext,
        autonomyTier: data.autonomy,
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
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "email", externalAccountId: normalized }),
      });
      if (!response.ok) return false;
      update({ primaryEmail: normalized });
      await refreshIntegrations();
      return true;
    } catch {
      return false;
    } finally {
      dispatch({ type: "setEmailSaving", saving: false });
    }
  }, [ensureOrganization, refreshIntegrations, update]);

  const launchOAuth = useCallback(async (url: string) => {
    dispatch({ type: "setSaving", saving: true });
    const ready = await ensureOrganization();
    dispatch({ type: "setSaving", saving: false });
    if (!ready) return;
    const popup = openOAuthPopup(url);
    if (!popup) return;
    watchOAuthPopup(popup, () => {
      void refreshIntegrations();
    });
  }, [ensureOrganization, refreshIntegrations]);

  const handleOAuthResult = useEffectEvent(() => {
    void refreshIntegrations();
  });

  useEffect(() => subscribeOAuthDone(() => handleOAuthResult()), []);

  const stepId = STEPS[idx].id;

  useEffect(() => {
    if (stepId !== "email") return;
    void ensureOrganization();
  }, [stepId, ensureOrganization]);

  const canContinue = useMemo(() => {
    if (stepId === "store") {
      return data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
    }
    if (stepId === "shopify") return hasShopify;
    if (stepId === "email") return hasEmailReady;
    return true;
  }, [stepId, data, hasShopify, hasEmailReady]);

  const next = useCallback(async () => {
    if (!canContinue || saving) return;
    if (stepId === "store") {
      dispatch({ type: "setSaving", saving: true });
      try {
        const ready = await ensureOrganization();
        if (!ready) return;
        await persistSettings();
      } finally {
        dispatch({ type: "setSaving", saving: false });
      }
    } else if (organization && stepId === "autonomy") {
      dispatch({ type: "setSaving", saving: true });
      try {
        await persistSettings();
      } finally {
        dispatch({ type: "setSaving", saving: false });
      }
    }
    dispatch({ type: "advance" });
  }, [canContinue, ensureOrganization, organization, persistSettings, saving, stepId]);

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

      if (!hasEmailReady) {
        if (!data.primaryEmail.trim()) return;
        const saved = await saveEmailIntegration(data.primaryEmail);
        if (!saved) return;
      }

      const completed = await persistSettings({ markOnboardingComplete: true });
      if (!completed) return;

      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      router.push("/dashboard");
      router.refresh();
    } finally {
      dispatch({ type: "setSaving", saving: false });
    }
  }, [
    data.primaryEmail,
    ensureOrganization,
    hasEmailReady,
    hasShopify,
    persistSettings,
    router,
    saveEmailIntegration,
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
    essentialsDone,
    exit,
    handlers: {
      back,
      ensureOrganization,
      finish,
      launchOAuth,
      next,
      saveEmailIntegration,
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
      hasShopify,
      orgEnsureFailed,
      orgEnsuring,
      orgReady: !!organization && !orgEnsuring && !orgEnsureFailed,
      saving,
    },
    step: STEPS[idx],
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
