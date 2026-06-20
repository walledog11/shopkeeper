"use client";

import { useReducer, useEffect, useMemo, useCallback, useEffectEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useUser, useOrganization, useOrganizationList } from "@clerk/nextjs";
import { useIntegrations } from "@/hooks/useIntegrations";
import {
  countOnboardingEssentials,
  isEmailIntegrationConfigured,
  resolveOnboardingStepIndex,
  type OnboardingResumeStep,
} from "@/lib/integrations/onboarding-setup";
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection";
import { Footer, Header } from "./_components/chrome";
import { openOAuthPopup, subscribeOAuthDone, watchOAuthPopup } from "@/lib/integrations/oauth-flow";
import {
  DEFAULT_DATA,
  STEPS,
  STORAGE_KEY,
  type OnboardingData,
  type StepId,
} from "./_components/model";
import type { Integration } from "@/types";
import { StepIntro } from "./_components/step-intro";
import { StepStore } from "./_components/step-store";
import { StepShopify } from "./_components/step-shopify";
import { StepEmail } from "./_components/step-email";
import { StepAutonomy } from "./_components/step-autonomy";
import { StepPlan } from "./_components/step-plan";

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
    const savedIdx = typeof parsed.idx === "number" ? Math.min(STEPS.length - 1, Math.max(0, parsed.idx)) : 0;
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

export default function OnboardingPage() {
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, idx })); } catch {}
  }, [data, idx]);

  const { data: integrationData, mutate: refreshIntegrations } = useIntegrations({
    enabled: !!organization,
    refreshInterval: 3000,
  });
  const rows = useMemo(() => integrationData ?? [], [integrationData]);
  const shopifyRow = rows.find(r => r.platform === "shopify");
  const emailRow = rows.find(r => r.platform === "email");
  const savedEmail = (emailRow?.fromEmail ?? emailRow?.externalAccountId)?.trim();
  if (savedEmail && state.prefilledEmail !== savedEmail) {
    dispatch({ type: "prefillEmail", email: savedEmail });
  }
  const hasShopify = isShopifyIntegrationActive(shopifyRow);
  const hasEmailReady = isEmailIntegrationConfigured(emailRow);
  const storeBriefed = data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
  const essentialsDone = countOnboardingEssentials({ storeBriefed, hasShopify, hasEmail: hasEmailReady });

  const isStepComplete = useCallback((step: StepId) => {
    if (step === "intro") return idx > 0;
    if (step === "store") return storeBriefed;
    if (step === "shopify") return hasShopify;
    if (step === "email") return hasEmailReady;
    if (step === "autonomy") return idx > STEPS.findIndex(item => item.id === "autonomy");
    if (step === "plan") return false;
    return false;
  }, [idx, storeBriefed, hasShopify, hasEmailReady]);

  const update = useCallback((patch: Partial<OnboardingData>) => {
    dispatch({ type: "patchData", patch });
  }, []);

  const persistSettings = useCallback(async (opts?: { markOnboardingComplete?: boolean }): Promise<boolean> => {
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
        ...(opts?.markOnboardingComplete && { onboardingCompletedAt: new Date().toISOString() }),
      },
    };
    if (name) body.name = name;

    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;

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
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "email", externalAccountId: normalized }),
      });
      if (!res.ok) return false;
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
    if (stepId === "store") return data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
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
      try { await persistSettings(); } finally { dispatch({ type: "setSaving", saving: false }); }
    }
    dispatch({ type: "advance" });
  }, [canContinue, ensureOrganization, organization, persistSettings, saving, stepId]);
  const advanceFromKeyboard = useEffectEvent(() => {
    void next();
  });
  function back() { dispatch({ type: "back" }); }

  async function finish() {
    dispatch({ type: "setSaving", saving: true });
    try {
      const ready = await ensureOrganization();
      if (!ready) return;
      if (!hasShopify) return;

      if (!hasEmailReady) {
        if (!data.primaryEmail.trim()) return;
        const saved = await saveEmailIntegration(data.primaryEmail);
        if (!saved) return;
      }

      const completed = await persistSettings({ markOnboardingComplete: true });
      if (!completed) return;

      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      router.push("/dashboard");
      router.refresh();
    } finally {
      dispatch({ type: "setSaving", saving: false });
    }
  }

  const otherMembership = userMemberships?.data?.find(m => m.organization.id !== organization?.id);
  const exit = useMemo(() => {
    if (otherMembership && setActive) {
      const target = otherMembership;
      return {
        label: `Back to ${target.organization.name}`,
        action: async () => {
          try { localStorage.removeItem(STORAGE_KEY); } catch {}
          try { await setActive({ organization: target.organization.id }); } catch {}
          router.push("/dashboard");
        },
      };
    }
    return {
      label: "Sign out",
      action: async () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        await signOut({ redirectUrl: "/login" });
      },
    };
  }, [otherMembership, setActive, signOut, router]);

  // Keyboard: Enter advances on non-textarea steps.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA")) return;
      if (stepId === "plan") return;
      if (!canContinue) return;
      e.preventDefault();
      advanceFromKeyboard();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepId, canContinue, saving]);

  const step = STEPS[idx];
  const orgReady = !!organization && !orgEnsuring && !orgEnsureFailed;

  return (
    <OnboardingPageView
      data={data}
      essentialsDone={essentialsDone}
      exit={exit}
      idx={idx}
      isStepComplete={isStepComplete}
      onGoto={i => (i <= idx || isStepComplete(STEPS[i].id)) && dispatch({ type: "setIdx", idx: i })}
      shopifyRow={shopifyRow}
      status={{
        canContinue,
        emailSaving,
        hasEmailReady,
        hasShopify,
        orgEnsureFailed,
        orgEnsuring,
        orgReady,
        saving,
      }}
      step={step}
      handlers={{
        back,
        ensureOrganization,
        finish,
        launchOAuth,
        next,
        saveEmailIntegration,
        update,
      }}
    />
  );
}

interface OnboardingPageViewProps {
  data: OnboardingData;
  essentialsDone: number;
  exit: { label: string; action: () => Promise<void> };
  idx: number;
  isStepComplete: (step: StepId) => boolean;
  onGoto: (idx: number) => void;
  shopifyRow: Integration | undefined;
  status: {
    canContinue: boolean;
    emailSaving: boolean;
    hasEmailReady: boolean;
    hasShopify: boolean;
    orgEnsureFailed: boolean;
    orgEnsuring: boolean;
    orgReady: boolean;
    saving: boolean;
  };
  step: (typeof STEPS)[number];
  handlers: {
    back: () => void;
    ensureOrganization: () => Promise<boolean>;
    finish: () => Promise<void>;
    launchOAuth: (url: string) => Promise<void>;
    next: () => Promise<void>;
    saveEmailIntegration: (email: string) => Promise<boolean>;
    update: (patch: Partial<OnboardingData>) => void;
  };
}

function OnboardingPageView({
  data,
  essentialsDone,
  exit,
  idx,
  isStepComplete,
  onGoto,
  shopifyRow,
  status,
  step,
  handlers,
}: OnboardingPageViewProps) {
  const stepId = step.id;

  return (
    <div className="dark relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed -right-52 -top-64 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.18)_0%,transparent_60%)] opacity-60" />
      <div aria-hidden className="pointer-events-none fixed -bottom-72 -left-52 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.10)_0%,transparent_70%)] opacity-60" />

      <Header
        idx={idx}
        essentialsDone={essentialsDone}
        isStepComplete={isStepComplete}
        onGoto={onGoto}
        exitLabel={exit.label}
        onExit={exit.action}
      />

      <main className="relative z-10 flex flex-1 justify-center px-7 pb-6 pt-8">
        <div key={step.id} className="w-full max-w-[820px] animate-[ob-fade-in_360ms_ease]">
          {stepId === "intro" && <StepIntro />}
          {stepId === "store" && <StepStore data={data} update={handlers.update} />}
          {stepId === "shopify" && (
            <StepShopify
              data={data}
              connected={status.hasShopify}
              shopifyRow={shopifyRow}
              onOAuth={handlers.launchOAuth}
            />
          )}
          {stepId === "email" && (
            <StepEmail
              data={data}
              update={handlers.update}
              emailConnected={status.hasEmailReady}
              orgReady={status.orgReady}
              orgLoading={status.orgEnsuring}
              orgError={status.orgEnsureFailed}
              onRetryOrg={() => { void handlers.ensureOrganization(); }}
              emailSaving={status.emailSaving}
              onSaveEmail={() => { void handlers.saveEmailIntegration(data.primaryEmail); }}
              onOAuth={handlers.launchOAuth}
            />
          )}
          {stepId === "autonomy" && <StepAutonomy data={data} update={handlers.update} />}
          {stepId === "plan" && (
            <StepPlan
              data={data}
              hasEmail={status.hasEmailReady}
              hasShopify={status.hasShopify}
              onStart={handlers.finish}
              onBack={handlers.back}
            />
          )}
        </div>
      </main>

      {stepId !== "plan" && (
        <Footer
          idx={idx}
          canContinue={status.canContinue}
          saving={status.saving}
          onNext={handlers.next}
          onBack={handlers.back}
        />
      )}
    </div>
  );
}
