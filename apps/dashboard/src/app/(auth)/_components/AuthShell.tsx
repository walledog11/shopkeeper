"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { AuthLogo } from "./AuthLogo";
import { cn } from "@/lib/ui/cn";

type AuthShellBaseProps = {
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  contentClassName?: string;
  signUpHref?: string;
  signInHref?: string;
  prompt?: "signIn" | "signUp";
};

type MarketingAuthShellProps = AuthShellBaseProps & {
  variant?: "marketing";
  panel?: "default" | "simple" | "split";
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  aside?: ReactNode;
  incentives?: ReactNode;
};

type AppAuthShellProps = AuthShellBaseProps & {
  variant: "app";
  title?: string;
  description?: string;
};

export type AuthShellProps = MarketingAuthShellProps | AppAuthShellProps;

const defaultBack = { backHref: "/", backLabel: "Back to home" };

function AuthTopBar({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-[#2b2118]"
      >
        <ArrowLeft className="size-4" />
        <span>{backLabel}</span>
      </Link>
      <Link
        href="/"
        aria-label="Shopkeeper"
        className="inline-flex items-center gap-2 text-[#2b2118] transition-colors hover:text-stone-600"
      >
        <Store className="size-7" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

function AuthSignInPrompt({ href }: { href: string }) {
  return (
    <p className="mt-6 text-center text-sm text-stone-500">
      Already have an account?{" "}
      <Link href={href} className="font-semibold text-[#2f7a4a] transition-colors hover:text-[#166534]">
        Sign in
      </Link>
    </p>
  );
}

function AuthSignUpPrompt({ href }: { href: string }) {
  return (
    <p className="mt-6 text-center text-sm text-stone-500">
      Don&apos;t have an account?{" "}
      <Link href={href} className="font-semibold text-[#2f7a4a] transition-colors hover:text-[#166534]">
        Sign up free
      </Link>
    </p>
  );
}

function SplitAuthShell({
  backHref = defaultBack.backHref,
  backLabel = defaultBack.backLabel,
  eyebrow,
  title,
  description,
  incentives,
  children,
  contentClassName,
  signInHref = "/login",
}: MarketingAuthShellProps) {
  return (
    <div className="relative min-h-screen text-[#2b2118]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(205,191,163,0.3),transparent_70%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <AuthTopBar backHref={backHref} backLabel={backLabel} />

        <div className="flex flex-1 items-center py-8 sm:py-12">
          <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-stone-900/10 bg-[#fbf8f1] shadow-[0_24px_64px_-32px_rgba(22,20,19,0.22)]">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
              <div className="border-b border-stone-900/10 px-6 py-8 sm:px-8 lg:border-b-0 lg:border-r">
                <div className="space-y-5">
                  {eyebrow ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#2f7a4a]/20 bg-[#2f7a4a]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f7a4a]">
                      <span className="size-1.5 rounded-full bg-[#2f7a4a]" />
                      {eyebrow}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <h1 className="font-sans text-[1.75rem] font-semibold tracking-tight sm:text-3xl">
                      {title}
                    </h1>
                    {description ? (
                      <p className="max-w-md text-sm leading-relaxed text-stone-600">{description}</p>
                    ) : null}
                  </div>

                  {incentives}
                </div>
              </div>

              <div className="flex min-w-0 flex-col justify-center px-6 py-8 sm:px-8">
                <div className={cn("auth-clerk-root w-full min-w-0", contentClassName)}>{children}</div>
                <AuthSignInPrompt href={signInHref} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleAuthShell({
  backHref = defaultBack.backHref,
  backLabel = defaultBack.backLabel,
  eyebrow,
  title,
  description,
  incentives,
  children,
  contentClassName,
  signUpHref = "/signup",
  signInHref = "/login",
  prompt = "signUp",
}: MarketingAuthShellProps) {
  return (
    <div className="relative min-h-screen text-[#2b2118]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(205,191,163,0.3),transparent_70%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 sm:px-6">
        <AuthTopBar backHref={backHref} backLabel={backLabel} />

        <div className="flex flex-1 items-center py-8 sm:py-12">
          <div className="w-full min-w-0 rounded-2xl border border-stone-900/10 bg-[#fbf8f1] px-6 py-8 shadow-[0_24px_64px_-32px_rgba(22,20,19,0.22)] sm:px-8">
            <div className="mb-6 space-y-3 text-center">
              {eyebrow ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-[#2f7a4a]/20 bg-[#2f7a4a]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f7a4a]">
                  <span className="size-1.5 rounded-full bg-[#2f7a4a]" />
                  {eyebrow}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <h1 className="font-sans text-[1.75rem] font-semibold tracking-tight sm:text-3xl">
                  {title}
                </h1>
                {description ? (
                  <p className="text-sm text-stone-500">{description}</p>
                ) : null}
              </div>
            </div>

            {incentives ? <div className="mb-6">{incentives}</div> : null}

            <div className={cn("auth-clerk-root w-full min-w-0", contentClassName)}>{children}</div>
            {prompt === "signIn" ? (
              <AuthSignInPrompt href={signInHref} />
            ) : (
              <AuthSignUpPrompt href={signUpHref} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketingAuthShell({
  backHref = defaultBack.backHref,
  backLabel = defaultBack.backLabel,
  eyebrow,
  title,
  description,
  children,
  aside,
  incentives,
  contentClassName,
  panel = "default",
  signUpHref = "/signup",
  signInHref = "/login",
  prompt,
}: MarketingAuthShellProps) {
  if (panel === "split") {
    return (
      <SplitAuthShell
        backHref={backHref}
        backLabel={backLabel}
        eyebrow={eyebrow}
        title={title}
        description={description}
        incentives={incentives}
        contentClassName={contentClassName}
        signInHref={signInHref}
      >
        {children}
      </SplitAuthShell>
    );
  }

  if (panel === "simple") {
    return (
      <SimpleAuthShell
        backHref={backHref}
        backLabel={backLabel}
        eyebrow={eyebrow}
        title={title}
        description={description}
        incentives={incentives}
        contentClassName={contentClassName}
        signUpHref={signUpHref}
        signInHref={signInHref}
        prompt={prompt}
      >
        {children}
      </SimpleAuthShell>
    );
  }

  const hasAside = Boolean(aside);

  return (
    <div className="relative min-h-screen text-[#2b2118]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(251,230,200,0.4),transparent_65%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <AuthTopBar backHref={backHref} backLabel={backLabel} />

        <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div
            className={cn(
              "grid w-full items-start gap-8 lg:gap-12",
              hasAside
                ? "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]"
                : "mx-auto max-w-xl",
            )}
          >
            <div className={cn("space-y-6", hasAside ? "max-w-xl" : "text-center")}>
              {eyebrow ? (
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-900/10 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                  <span className="size-2 rounded-full bg-[#2f7a4a]" />
                  {eyebrow}
                </div>
              ) : null}

              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-normal tracking-tight text-[#2b2118] [font-family:var(--m-serif)] sm:text-5xl">
                  {title}
                </h1>
                {description ? (
                  <p className="max-w-lg text-base leading-relaxed text-stone-500 sm:text-lg">
                    {description}
                  </p>
                ) : null}
              </div>

              {aside}
            </div>

            <div
              className={cn(
                "w-full min-w-0",
                hasAside ? "lg:sticky lg:top-24" : "mx-auto max-w-md",
                contentClassName,
              )}
            >
              <div className="auth-clerk-root w-full min-w-0">{children}</div>
              {hasAside ? (
                <AuthSignInPrompt href={signInHref} />
              ) : (
                <AuthSignUpPrompt href={signUpHref} />
              )}
            </div>
          </div>
        </div>
      </div>
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
    <div className="flex min-h-screen flex-col font-sans text-[#2b2118]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8 sm:px-6">
        <AuthLogo className="mb-10" />

        <div className="flex flex-1 flex-col justify-center pb-10">
          {(title || description) && (
            <div className="mb-5 space-y-1">
              {title ? (
                <h1 className="text-lg font-semibold tracking-tight text-[#2b2118]">{title}</h1>
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
