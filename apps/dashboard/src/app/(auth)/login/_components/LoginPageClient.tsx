"use client";

import { useUser } from "@clerk/nextjs";
import { SignIn } from "@clerk/nextjs";
import AuthShell from "../../_components/AuthShell";
import { AccountActionsCard } from "../../_components/AccountActionsCard";
import { AuthLoadingCard } from "../../_components/AuthLoadingCard";
import { getAuthClerkAppearance } from "../../_components/clerk-appearance";

export function LoginPageClient() {
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
      panel="simple"
      backHref="/"
      backLabel="Back to home"
      title="Sign in"
      description="Enter your email to access your workspace."
    >
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
    </AuthShell>
  );
}
