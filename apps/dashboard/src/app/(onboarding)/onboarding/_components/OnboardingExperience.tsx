"use client";

import Image from "next/image";
import { Footer } from "./chrome";
import { StepIntro } from "./step-intro";
import { StepShopify } from "./step-shopify";
import { StepConnect } from "./step-connect";
import { StepEmail } from "./step-email";
import { StepPlan } from "./step-plan";
import {
  useOnboardingFlow,
  type OnboardingFlow,
} from "../_hooks/useOnboardingFlow";

export interface OnboardingChannelConfig {
  telegramBotUsername: string | null;
  imessageHandle: string | null;
  shopifySimulatorEnabled: boolean;
}

export function OnboardingExperience(channels: OnboardingChannelConfig) {
  const flow = useOnboardingFlow();
  return <OnboardingExperienceView flow={flow} channels={channels} />;
}

function OnboardingExperienceView({
  flow,
  channels,
}: {
  flow: OnboardingFlow;
  channels: OnboardingChannelConfig;
}) {
  const {
    data,
    emailRow,
    exit,
    idx,
    kbSync,
    shopifyRow,
    status,
    step,
    handlers,
  } = flow;
  const stepId = step.id;

  return (
    <div className="onboarding-shell relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#efe9df] px-4 py-6 text-foreground sm:px-6 sm:py-10">
      {/* Dawn-sky scenery behind the card — the same placeholder photography as
          the marketing footer, masked so it fades up into the paper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[62vh] [mask-image:linear-gradient(180deg,transparent_0%,black_55%)]"
      >
        <Image
          src="/atmosphere/footer-dawn.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[center_58%] [filter:sepia(0.08)_saturate(0.9)_brightness(1.04)]"
        />
        <div className="absolute inset-0 bg-[#efe9df]/30" />
        <div className="m-grain absolute inset-0" />
      </div>
      <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-[900px] flex-col overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.55)] bg-background/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_1px_2px_rgba(43,33,24,0.05),0_28px_70px_-28px_rgba(43,33,24,0.32)] backdrop-blur-2xl sm:max-h-[calc(100dvh-5rem)]">
        <main className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-7">
          <div key={step.id} className="m-auto w-full max-w-[640px] animate-[ob-fade-in_360ms_ease]">
          {stepId === "intro" && <StepIntro data={data} update={handlers.update} />}
          {stepId === "shopify" && (
            <StepShopify
              data={data}
              connected={status.hasShopify}
              shopifyRow={shopifyRow}
              kbSync={kbSync}
              onOAuth={handlers.launchOAuth}
              onSimulate={handlers.simulateShopify}
              simulatorEnabled={channels.shopifySimulatorEnabled}
              simulating={status.shopifySimulating}
            />
          )}
          {stepId === "connect" && (
            <StepConnect
              telegramBotUsername={channels.telegramBotUsername}
              imessageHandle={channels.imessageHandle}
            />
          )}
          {stepId === "email" && (
            <StepEmail
              data={data}
              update={handlers.update}
              emailConnected={status.hasEmailReady}
              emailIntegration={emailRow}
              orgReady={status.orgReady}
              orgLoading={status.orgEnsuring}
              orgError={status.orgEnsureFailed}
              onRetryOrg={() => { void handlers.ensureOrganization(); }}
              emailSaving={status.emailSaving}
              onSaveEmail={() => { void handlers.saveEmailIntegration(data.primaryEmail); }}
              onOAuth={handlers.launchOAuth}
            />
          )}
          {stepId === "plan" && (
            <StepPlan
              data={data}
              hasEmail={status.hasEmailReady}
              hasMessaging={status.hasMessaging}
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
            stepId={stepId}
            canContinue={status.canContinue}
            hasEmail={status.hasEmailReady}
            hasMessaging={status.hasMessaging}
            saving={status.saving}
            onNext={handlers.next}
            onBack={handlers.back}
            exitLabel={exit.label}
            onExit={exit.action}
          />
        )}
      </div>
    </div>
  );
}
