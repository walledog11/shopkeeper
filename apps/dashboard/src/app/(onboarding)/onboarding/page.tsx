"use client";

import { useState, useEffect, useMemo, useCallback, useEffectEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useUser, useOrganization, useOrganizationList } from "@clerk/nextjs";
import { useIntegrations } from "@/hooks/useIntegrations";
import { Footer, Header } from "./_components/chrome";
import { openOAuthPopup, subscribeOAuthDone, watchOAuthPopup } from "@/lib/integrations/oauth-flow";
import {
  CHANNEL_META,
  DEFAULT_DATA,
  STEPS,
  STORAGE_KEY,
  type ChannelKey,
  type OnboardingData,
} from "./_components/model";
import { StepIntro } from "./_components/step-intro";
import { StepStore } from "./_components/step-store";
import { StepShopify } from "./_components/step-shopify";
import { StepChannels } from "./_components/step-channels";
import { StepAutonomy } from "./_components/step-autonomy";
import { StepPlan } from "./_components/step-plan";

function readInitialOnboardingState() {
  if (typeof window === "undefined") return { data: DEFAULT_DATA, idx: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: DEFAULT_DATA, idx: 0 };
    const parsed = JSON.parse(raw) as Partial<OnboardingData & { idx: number }>;
    return {
      data: { ...DEFAULT_DATA, ...parsed },
      idx: typeof parsed.idx === "number" ? Math.min(STEPS.length - 1, Math.max(0, parsed.idx)) : 0,
    };
  } catch {
    return { data: DEFAULT_DATA, idx: 0 };
  }
}

export default function OnboardingPage() {
  const { push } = useRouter();
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
  const orgCreationInFlight = useRef(false);


  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, idx })); } catch {}
  }, [data, idx]);

  const { data: integrationData, mutate: refreshIntegrations } = useIntegrations({
    enabled: !!organization,
    refreshInterval: 3000,
  });
  const rows = useMemo(() => integrationData ?? [], [integrationData]);
  const connected = useMemo(() => {
    const set = new Set<ChannelKey>();
    for (const r of rows) {
      if (r.platform === "email" || r.platform === "ig_dm" || r.platform === "shopify") set.add(r.platform);
    }
    return set;
  }, [rows]);
  const shopifyRow = rows.find(r => r.platform === "shopify");

  const update = useCallback((patch: Partial<OnboardingData>) => setData(d => ({ ...d, ...patch })), []);

  const persistSettings = useCallback(async () => {
    const name = data.storeName.trim();
    const aiContext = data.sells.trim();
    const firstName = data.founderName.trim();
    const tasks: Promise<unknown>[] = [];
    tasks.push(fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, settings: { aiContext, autonomyTier: data.autonomy } }),
    }));
    if (user && firstName && firstName !== user.firstName) {
      tasks.push(user.update({ firstName }));
    }
    await Promise.allSettled(tasks);
  }, [data, user]);

  const ensureOrganization = useCallback(async (): Promise<boolean> => {
    if (organization) return true;
    if (!createOrganization || !setActive || orgCreationInFlight.current) return false;
    const name = data.storeName.trim();
    if (!name) return false;
    orgCreationInFlight.current = true;
    try {
      const created = await createOrganization({ name });
      await setActive({ organization: created.id }).then(() => persistSettings());
      return true;
    } catch {
      return false;
    } finally {
      orgCreationInFlight.current = false;
    }
  }, [organization, createOrganization, setActive, data.storeName, persistSettings]);

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

  const canContinue = useMemo(() => {
    if (stepId === "store")    return data.storeName.trim().length > 0 && data.founderName.trim().length > 0;
    if (stepId === "channels") return connected.size > 0;
    return true;
  }, [stepId, data, connected]);

  const next = useCallback(async () => {
    if (!canContinue || saving) return;
    if (organization && (stepId === "store" || stepId === "autonomy")) {
      setSaving(true);
      try { await persistSettings(); } finally { setSaving(false); }
    }
    setIdx(i => Math.min(STEPS.length - 1, i + 1));
  }, [canContinue, organization, persistSettings, saving, stepId]);
  const advanceFromKeyboard = useEffectEvent(() => {
    void next();
  });
  function back() { setIdx(i => Math.max(0, i - 1)); }

  async function finish() {
    setSaving(true);
    try {
      const ready = await ensureOrganization();
      if (!ready) return;
      if (organization) await persistSettings();
    } finally {
      setSaving(false);
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    push("/dashboard");
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
          push("/dashboard");
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
  }, [otherMembership, setActive, signOut, push]);

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

  return (
    <div className="dark relative flex min-h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed -right-52 -top-64 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.18)_0%,transparent_60%)] opacity-60" />
      <div aria-hidden className="pointer-events-none fixed -bottom-72 -left-52 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.10)_0%,transparent_70%)] opacity-60" />

      <Header idx={idx} onGoto={i => i <= idx && setIdx(i)} exitLabel={exit.label} onExit={exit.action} />

      <main className="relative z-10 flex flex-1 justify-center px-7 pb-6 pt-8">
        <div key={step.id} className="w-full max-w-[820px] animate-[ob-fade-in_360ms_ease]">
          {stepId === "intro"    && <StepIntro />}
          {stepId === "store"    && <StepStore    data={data} update={update} />}
          {stepId === "shopify"  && <StepShopify  data={data} connected={connected.has("shopify")} shopifyRow={shopifyRow} onOAuth={launchOAuth} />}
          {stepId === "channels" && <StepChannels data={data} update={update} connected={connected} onSkip={() => setIdx(i => Math.min(STEPS.length - 1, i + 1))} onOAuth={launchOAuth} />}
          {stepId === "autonomy" && <StepAutonomy data={data} update={update} />}
          {stepId === "plan"     && <StepPlan     data={data} connected={connected} onStart={finish} onBack={back} />}
        </div>
      </main>

      {stepId !== "plan" && (
        <Footer idx={idx} canContinue={canContinue} saving={saving} onNext={next} onBack={back} />
      )}
    </div>
  );
}
