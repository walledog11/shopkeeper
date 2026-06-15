"use client";

import Image from "next/image";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import type { OAuthPopupVisualState } from "@/lib/integrations/oauth-popup-shell";
import { cn } from "@/lib/ui/cn";

export function OAuthPopupShell({
  title,
  message,
  footer,
  state,
}: {
  title: string;
  message: string;
  footer?: string;
  state: OAuthPopupVisualState;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card px-7 py-8 text-center shadow-lg">
      <div
        className={cn(
          "mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl",
          state === "success" && "bg-emerald-400/10 text-emerald-400",
          state === "error" && "bg-red-400/10 text-red-400",
          state === "loading" && "bg-muted text-muted-foreground",
        )}
      >
        {state === "success" ? (
          <CheckCircle2 className="size-7" aria-hidden />
        ) : state === "error" ? (
          <AlertCircle className="size-7" aria-hidden />
        ) : (
          <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
        )}
      </div>

      <div className="mx-auto mb-3 flex items-center justify-center gap-2">
        <Image
          src="/logos/shopkeeper-shop-logo.png"
          alt=""
          width={20}
          height={20}
          className="rounded-[6px]"
        />
        <span className="text-[13px] font-semibold text-foreground">{PRODUCT_NAME}</span>
      </div>

      <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
      {footer ? <p className="mt-5 text-xs text-muted-foreground/70">{footer}</p> : null}
    </div>
  );
}
