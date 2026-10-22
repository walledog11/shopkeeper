"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Footer } from "./chrome";
import { StepShopify } from "./step-shopify";
import { StepConnect } from "./step-connect";
import { StepEmail } from "./step-email";
import { StepPlan } from "./step-plan";
import { useOnboardingFlow } from "../_hooks/useOnboardingFlow";
import type { OAuthOutcome } from "@/lib/integrations/oauth-contract";

export interface OnboardingChannelConfig {
  imessageHandle: string | null;
  shopifySimulatorEnabled: boolean;
  instagramConnectAvailable: boolean;
  storefrontChatGloballyEnabled: boolean;
  shopifyClientId: string | null;
}

export function OnboardingExperience({ pinnedStepIndex, oauthOutcome, ...channels }: OnboardingChannelConfig & {
  pinnedStepIndex: number | null; oauthOutcome: OAuthOutcome | null;
}) {
  const { data, emailIntegrations, exit, idx, instagramRow, kbSync, shopifyRow, status, step, handlers } = useOnboardingFlow(pinnedStepIndex, oauthOutcome, channels.storefrontChatGloballyEnabled);
  const contentRef = useRef<HTMLElement>(null);
  const previousStep = useRef(idx);
  useEffect(() => {
    if (previousStep.current === idx) return;
    previousStep.current = idx;
    contentRef.current?.querySelector("h1")?.focus({ preventScroll: true });
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [idx]);
  const disabled = status.controlsPending || !status.hydrated;

  return <div className="onboarding-shell relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#efe9df] px-4 py-6 text-foreground sm:px-6 sm:py-10">
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62vh] [mask-image:linear-gradient(180deg,transparent_0%,black_55%)]">
      <Image src="/atmosphere/footer-dawn.jpg" alt="" fill sizes="100vw" className="object-cover object-[center_58%] [filter:sepia(0.08)_saturate(0.9)_brightness(1.04)]" />
      <div className="absolute inset-0 bg-[#efe9df]/30" />
      <div className="m-grain absolute inset-0" />
    </div>
    <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-[900px] flex-col overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.55)] bg-background/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_1px_2px_rgba(43,33,24,0.05),0_28px_70px_-28px_rgba(43,33,24,0.32)] backdrop-blur-2xl sm:max-h-[calc(100dvh-5rem)]">
      <main ref={contentRef} className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-7" aria-busy={!status.hydrated}>
        <div className="m-auto w-full max-w-[640px]">
        {!status.hydrated ? <p role="status" className="flex items-center gap-2 py-16 text-sm text-strong"><Loader2 size={17} className="animate-spin" />Preparing your workspace…</p> : <>
          {status.error && <p role="alert" className="mx-auto mb-4 max-w-[560px] rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-center text-[13px] text-destructive">{status.error}</p>}
          <div key={step.id} className="animate-[ob-fade-in_360ms_ease] motion-reduce:animate-none">
            {step.id === "shopify" && <StepShopify data={data} update={handlers.update} connected={status.hasShopify} shopifyRow={shopifyRow} kbSync={kbSync} onOAuth={handlers.launchOAuth}
              onSimulate={handlers.simulateShopify} simulatorEnabled={channels.shopifySimulatorEnabled} simulating={status.shopifySimulating} oauthPending={status.oauthPendingProvider === "shopify"} disabled={disabled} />}
            {step.id === "email" && <StepEmail data={data} update={handlers.update} instagramConnected={status.hasInstagramReady} instagramConnectAvailable={channels.instagramConnectAvailable}
              forwardingIntegration={emailIntegrations.forwarding} gmailIntegration={emailIntegrations.gmail} instagramIntegration={instagramRow}
              orgReady={status.orgReady} orgLoading={status.orgEnsuring} orgError={status.orgEnsureFailed} onRetryOrg={() => { void handlers.ensureOrganization(); }}
              emailSaving={status.emailSaving} oauthPendingProvider={status.oauthPendingProvider} onSaveForwarding={email => { void handlers.saveEmailIntegration(email, "postmark"); }}
              onSaveGmail={email => { void handlers.saveEmailIntegration(email, "gmail"); }} onOAuth={handlers.launchOAuth} shopifyRow={shopifyRow}
              storefrontChatGloballyEnabled={channels.storefrontChatGloballyEnabled} shopifyClientId={channels.shopifyClientId} onUpdateStorefrontChat={handlers.updateStorefrontChat} disabled={disabled} />}
            {step.id === "connect" && <StepConnect imessageHandle={channels.imessageHandle} />}
            {step.id === "plan" && <StepPlan hasCustomerChannel={status.hasCustomerChannel} hasEmail={Boolean(emailIntegrations.gmail)} hasForwarding={Boolean(emailIntegrations.forwarding)}
              hasInstagram={status.hasInstagramReady} hasMessaging={status.hasMessaging} hasShopify={status.hasShopify} hasStorefrontChat={status.hasStorefrontChat}
              storeDomain={shopifyRow?.externalAccountId} kbSync={kbSync} onNavigate={handlers.navigate} saving={disabled} />}
          </div>
        </>}
        </div>
      </main>
      <Footer idx={idx} stepId={step.id} canContinue={step.id === "plan" ? status.hasShopify : status.canContinue}
        hasCustomerChannel={status.hasCustomerChannel} hasMessaging={status.hasMessaging} saving={disabled}
        onNext={step.id === "plan" ? handlers.finish : handlers.next} onBack={handlers.back}
        onNavigate={handlers.navigate} exitLabel={exit.label} onExit={exit.action} />
    </div>
  </div>;
}
