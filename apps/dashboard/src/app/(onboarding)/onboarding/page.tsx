"use client";

import { Footer, Header } from "./_components/chrome";
import { StepIntro } from "./_components/step-intro";
import { StepStore } from "./_components/step-store";
import { StepShopify } from "./_components/step-shopify";
import { StepEmail } from "./_components/step-email";
import { StepAutonomy } from "./_components/step-autonomy";
import { StepPlan } from "./_components/step-plan";
import {
  useOnboardingFlow,
  type OnboardingFlow,
} from "./_hooks/useOnboardingFlow";

export default function OnboardingPage() {
  const flow = useOnboardingFlow();
  return <OnboardingPageView {...flow} />;
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
}: OnboardingFlow) {
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
