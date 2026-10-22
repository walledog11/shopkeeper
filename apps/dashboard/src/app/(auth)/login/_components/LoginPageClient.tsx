"use client";

import { useUser } from "@clerk/nextjs";
import { SignIn } from "@clerk/nextjs";
import AuthShell from "../../_components/AuthShell";
import { AccountActionsCard } from "../../_components/AccountActionsCard";
import { AuthLoadingCard } from "../../_components/AuthLoadingCard";
import { getAuthClerkAppearance } from "../../_components/clerk-appearance";

export function LoginPageClient() {
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
      prompt="signUp"
      title="Welcome back"
      description="Sign in to your Shopkeeper workspace."
    >
      {!isLoaded ? (
        <AuthLoadingCard variant="form" />
      ) : (
        <SignIn
          routing="hash"
          signUpUrl="/signup"
          fallbackRedirectUrl="/dashboard"
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
