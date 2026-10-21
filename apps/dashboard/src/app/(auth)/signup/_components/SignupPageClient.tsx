"use client";

import { useUser } from "@clerk/nextjs";
import { SignUp } from "@clerk/nextjs";
import AuthShell from "../../_components/AuthShell";
import { AccountActionsCard } from "../../_components/AccountActionsCard";
import { AuthLoadingCard } from "../../_components/AuthLoadingCard";
import { getAuthClerkAppearance } from "../../_components/clerk-appearance";

export function SignupPageClient() {
  const { isLoaded, isSignedIn } = useUser();

  if (isLoaded && isSignedIn) {
    return (
      <AuthShell variant="app">
        <AccountActionsCard backHref="/dashboard" backLabel="Back to dashboard" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      prompt="signIn"
      title="Create your account"
      description="Get started with Shopkeeper for your Shopify store."
    >
      {!isLoaded ? (
        <AuthLoadingCard variant="form" />
      ) : (
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
      )}
    </AuthShell>
  );
}
