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
      backHref="/"
      backLabel="Back to home"
      eyebrow="Welcome back"
      title={
        <>
          Sign in to
          <br />
          <span className="text-green-400">Shopkeeper.</span>
        </>
      }
      description="Access your inbox, drafts, and workspace settings."
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
