"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DotPattern } from "@/components/ui/dot-pattern";
import { BrandMark } from "@/components/BrandMark";
import { AuthLogo } from "./AuthLogo";
import { cn } from "@/lib/ui/cn";

type AuthShellBaseProps = {
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  contentClassName?: string;
};

type MarketingAuthShellProps = AuthShellBaseProps & {
  variant?: "marketing";
  eyebrow: string;
  title: ReactNode;
  description: string;
  aside?: ReactNode;
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
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <span>{backLabel}</span>
      </Link>
      <BrandMark />
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
  contentClassName,
}: MarketingAuthShellProps) {
  const hasAside = Boolean(aside);

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-background text-foreground">
      <DotPattern
        width={28}
        height={28}
        cr={1}
        className="absolute inset-0 opacity-[0.16] [mask-image:radial-gradient(circle_at_top,white,transparent_72%)]"
      />
      <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.16),transparent_60%)]" />

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
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <span className="size-2 rounded-full bg-green-400" />
                {eyebrow}
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {description}
                </p>
              </div>

              {aside}
            </div>

            <div
              className={cn(
                "w-full",
                hasAside ? "lg:sticky lg:top-24" : "mx-auto max-w-md",
                contentClassName,
              )}
            >
              {children}
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
    <div className="dashboard-shell dark flex min-h-screen flex-col bg-background font-sans text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8 sm:px-6">
        <AuthLogo className="mb-10" />

        <div className="flex flex-1 flex-col justify-center pb-10">
          {(title || description) && (
            <div className="mb-5 space-y-1">
              {title ? (
                <h1 className="text-lg font-semibold tracking-tight text-white">{title}</h1>
              ) : null}
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          )}

          <div className={cn("w-full", contentClassName)}>{children}</div>
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
