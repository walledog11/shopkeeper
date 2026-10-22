"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ShopkeeperLogo } from "@/components/ShopkeeperLogo";
import { cn } from "@/lib/ui/cn";
import { AuthLogo } from "./AuthLogo";

type AuthShellBaseProps = {
  children: ReactNode;
  contentClassName?: string;
};

type MarketingAuthShellProps = AuthShellBaseProps & {
  variant?: "marketing";
  title: string;
  description: string;
  prompt: "signIn" | "signUp";
  /** When false, hides the sign-in / sign-up cross-link under the form. */
  showAlternateAccountLink?: boolean;
};

type AppAuthShellProps = AuthShellBaseProps & {
  variant: "app";
  title?: string;
  description?: string;
};

export type AuthShellProps = MarketingAuthShellProps | AppAuthShellProps;

function MarketingAuthShell({
  title,
  description,
  children,
  contentClassName,
  prompt,
  showAlternateAccountLink = true,
}: MarketingAuthShellProps) {
  const isSignInPrompt = prompt === "signIn";

  return (
    <div className="m-page flex min-h-dvh! flex-col">
      <header className="mx-auto flex w-full max-w-6xl px-6 py-7">
        <ShopkeeperLogo className="[&_.m-nav-wordmark]:block!" />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pb-16 pt-12 sm:items-center sm:pb-36 sm:pt-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 text-center">
            <h1 className="m-display text-[2rem] sm:text-[2.5rem]">{title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">
              {description}
            </p>
          </div>

          <div className={cn("auth-clerk-root w-full min-w-0", contentClassName)}>{children}</div>

          {showAlternateAccountLink ? (
            <p className="mt-7 text-center text-sm text-[color:var(--m-ink-2)]">
              {isSignInPrompt ? "Already have an account?" : "Don't have an account?"}{" "}
              <Link
                href={isSignInPrompt ? "/login" : "/signup"}
                className="rounded-sm font-medium text-[color:var(--m-ink)] underline decoration-[color:var(--m-line-strong)] underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--m-focus)]"
              >
                {isSignInPrompt ? "Sign in" : "Sign up"}
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function AppAuthShell({
  title,
  description,
  children,
  contentClassName,
}: AppAuthShellProps) {
  return (
    <div className="dashboard-shell flex min-h-screen flex-col bg-background font-sans text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8 sm:px-6">
        <AuthLogo className="mb-10" />

        <div className="flex flex-1 flex-col justify-center pb-10">
          {(title || description) && (
            <div className="mb-5 space-y-1">
              {title ? (
                <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
              ) : null}
              {description ? (
                <p className="text-sm text-stone-500">{description}</p>
              ) : null}
            </div>
          )}

          <div className={cn("auth-clerk-root w-full min-w-0", contentClassName)}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function AuthShell(props: AuthShellProps) {
  if (props.variant === "app") {
    return <AppAuthShell {...props} />;
  }

  return <MarketingAuthShell {...props} />;
}
