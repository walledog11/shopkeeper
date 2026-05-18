import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DotPattern } from "@/components/ui/dot-pattern";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/ui/cn";

interface AuthShellProps {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  contentClassName?: string;
}

export default function AuthShell({
  backHref,
  backLabel,
  eyebrow,
  title,
  description,
  children,
  aside,
  contentClassName,
}: AuthShellProps) {
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
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(to_top,rgba(255,255,255,0.03),transparent)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/45 transition-colors hover:text-white/80"
          >
            <ArrowLeft className="size-4" />
            <span>{backLabel}</span>
          </Link>

          <BrandMark />
        </div>

        <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div
            className={cn(
              "grid w-full items-center gap-8 lg:gap-12",
              hasAside
                ? "lg:grid-cols-[minmax(0,1fr)_minmax(24rem,31rem)]"
                : "mx-auto max-w-xl",
            )}
          >
            <div className={cn("space-y-6", hasAside ? "max-w-xl" : "text-center")}>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                <span className="size-2 rounded-full bg-green-400" />
                {eyebrow}
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-lg text-base leading-relaxed text-white/60 sm:text-lg">
                  {description}
                </p>
              </div>

              {aside}
            </div>

            <div
              className={cn(
                "w-full",
                hasAside ? "lg:justify-self-end" : "mx-auto max-w-md",
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
