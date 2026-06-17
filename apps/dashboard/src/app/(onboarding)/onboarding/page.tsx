"use client";

import { useState, useEffect, useMemo, useCallback, useEffectEvent, useRef } from "react";
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

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { createOrganization, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  const [initialState] = useState(() => readInitialOnboardingState());
  const [idx, setIdx] = useState(initialState.idx);
  const [data, setData] = useState<OnboardingData>(initialState.data);
  const [saving, setSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [orgEnsuring, setOrgEnsuring] = useState(false);
  const [orgEnsureFailed, setOrgEnsureFailed] = useState(false);
  const orgCreationInFlight = useRef(false);
  const emailPrefilled = useRef(false);

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

  const update = useCallback((patch: Partial<OnboardingData>) => setData(d => ({ ...d, ...patch })), []);

  useEffect(() => {
    if (emailPrefilled.current || !emailRow) return;
    const saved = (emailRow.fromEmail ?? emailRow.externalAccountId)?.trim();
    if (!saved) return;
    emailPrefilled.current = true;
    setData(d => (d.primaryEmail.trim() ? d : { ...d, primaryEmail: saved }));
  }, [emailRow]);

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
      setOrgEnsureFailed(false);
      return true;
    }
    if (!createOrganization || !setActive || orgCreationInFlight.current) return false;
    const name = data.storeName.trim();
    if (!name) return false;
    orgCreationInFlight.current = true;
    setOrgEnsuring(true);
    setOrgEnsureFailed(false);
    try {
      const created = await createOrganization({ name });
      await setActive({ organization: created.id }).then(() => persistSettings());
      return true;
    } catch {
      setOrgEnsureFailed(true);
      return false;
    } finally {
      orgCreationInFlight.current = false;
      setOrgEnsuring(false);
    }
  }, [organization, createOrganization, setActive, data.storeName, persistSettings]);

  const saveEmailIntegration = useCallback(async (email: string): Promise<boolean> => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    setEmailSaving(true);
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
      setEmailSaving(false);
    }
  }, [ensureOrganization, refreshIntegrations, update]);

  const launchOAuth = useCallback(async (url: string) => {
    setSaving(true);
    const ready = await ensureOrganization();
    setSaving(false);
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
      setSaving(true);
      try {
        const ready = await ensureOrganization();
        if (!ready) return;
        await persistSettings();
      } finally {
        setSaving(false);
      }
    } else if (organization && stepId === "autonomy") {
      setSaving(true);
      try { await persistSettings(); } finally { setSaving(false); }
    }
    setIdx(i => Math.min(STEPS.length - 1, i + 1));
  }, [canContinue, ensureOrganization, organization, persistSettings, saving, stepId]);
  const advanceFromKeyboard = useEffectEvent(() => {
    void next();
  });
  function back() { setIdx(i => Math.max(0, i - 1)); }

  async function finish() {
    setSaving(true);
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
      setSaving(false);
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
    <div className="dark relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed -right-52 -top-64 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.18)_0%,transparent_60%)] opacity-60" />
      <div aria-hidden className="pointer-events-none fixed -bottom-72 -left-52 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.10)_0%,transparent_70%)] opacity-60" />

      <Header
        idx={idx}
        essentialsDone={essentialsDone}
        isStepComplete={isStepComplete}
        onGoto={i => (i <= idx || isStepComplete(STEPS[i].id)) && setIdx(i)}
        exitLabel={exit.label}
        onExit={exit.action}
      />

      <main className="relative z-10 flex flex-1 justify-center px-7 pb-6 pt-8">
        <div key={step.id} className="w-full max-w-[820px] animate-[ob-fade-in_360ms_ease]">
          {stepId === "intro"    && <StepIntro />}
          {stepId === "store"    && <StepStore    data={data} update={update} />}
          {stepId === "shopify"  && <StepShopify  data={data} connected={hasShopify} shopifyRow={shopifyRow} onOAuth={launchOAuth} />}
          {stepId === "email" && (
            <StepEmail
              data={data}
              update={update}
              emailConnected={hasEmailReady}
              orgReady={orgReady}
              orgLoading={orgEnsuring}
              orgError={orgEnsureFailed}
              onRetryOrg={() => { void ensureOrganization(); }}
              emailSaving={emailSaving}
              onSaveEmail={() => { void saveEmailIntegration(data.primaryEmail); }}
              onOAuth={launchOAuth}
            />
          )}
          {stepId === "autonomy" && <StepAutonomy data={data} update={update} />}
          {stepId === "plan"     && (
            <StepPlan
              data={data}
              hasEmail={hasEmailReady}
              hasShopify={hasShopify}
              onStart={finish}
              onBack={back}
            />
          )}
        </div>
      </main>

      {stepId !== "plan" && (
        <Footer idx={idx} canContinue={canContinue} saving={saving} onNext={next} onBack={back} />
      )}
    </div>
  );
}
