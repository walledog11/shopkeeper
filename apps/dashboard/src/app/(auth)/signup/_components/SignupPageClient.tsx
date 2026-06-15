"use client";

import { useUser } from "@clerk/nextjs";
import { SignUp } from "@clerk/nextjs";
import AuthShell from "../../_components/AuthShell";
import { AccountActionsCard } from "../../_components/AccountActionsCard";
import { AuthLoadingCard } from "../../_components/AuthLoadingCard";
import { getAuthClerkAppearance } from "../../_components/clerk-appearance";
import { SignupIncentives } from "./SignupIncentives";

export function SignupPageClient() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <AuthShell variant="app">
        <AuthLoadingCard />
      </AuthShell>
    );
  }

  if (isSignedIn) {
    return (
      <AuthShell variant="app">
        <AccountActionsCard backHref="/dashboard" backLabel="Back to dashboard" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panel="split"
      prompt="signIn"
      backHref="/"
      backLabel="Back to home"
      eyebrow="14-day free trial"
      title="Sign up free"
      description="Every DM, SMS, and Shopify order in one inbox — Shopkeeper drafts, you approve."
      incentives={<SignupIncentives />}
    >
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl="/onboarding"
        appearance={getAuthClerkAppearance({
          header: "hidden",
          headerTitle: "hidden",
          headerSubtitle: "hidden",
        })}
      />
    </AuthShell>
  );
}
