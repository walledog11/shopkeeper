"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { OAUTH_DONE_MESSAGE_TYPE, OAUTH_POPUP_NAME } from "@/lib/integrations/oauth-flow";
import { OAUTH_ERROR_MESSAGES } from "@/lib/integrations/catalog";
import { cn } from "@/lib/ui/cn";

const CONNECTED_VALUES = new Set(["instagram", "shopify", "gmail", "outlook"]);

function safeConnected(value: string | null): string | null {
  return value && CONNECTED_VALUES.has(value) ? value : null;
}

function safeError(value: string | null): string | null {
  return value && Object.prototype.hasOwnProperty.call(OAUTH_ERROR_MESSAGES, value) ? value : null;
}

function OAuthCompleteContent() {
  const searchParams = useSearchParams();
  const connected = safeConnected(searchParams.get("connected"));
  const error = safeError(searchParams.get("error"));

  useEffect(() => {
    const payload = {
      type: OAUTH_DONE_MESSAGE_TYPE,
      connected,
      error,
    };

    if (window.opener && window.opener !== window && window.name === OAUTH_POPUP_NAME) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {
        // Fall through to in-tab redirect below.
      }
      window.close();
      return;
    }

    const nextUrl = new URL("/dashboard/integrations", window.location.origin);
    if (connected) nextUrl.searchParams.set("connected", connected);
    if (error) nextUrl.searchParams.set("error", error);
    window.location.replace(`${nextUrl.pathname}${nextUrl.search}`);
  }, [connected, error]);

  const success = Boolean(connected) && !error;
  const message = success
    ? "Connection complete. Returning you to Shopkeeper…"
    : OAUTH_ERROR_MESSAGES[error ?? ""] ?? "Something went wrong. Returning you to Shopkeeper…";

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070707] px-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.16)_0%,transparent_62%)]"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div
          className={cn(
            "mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl",
            success ? "bg-emerald-400/15 text-emerald-400" : error ? "bg-red-400/15 text-red-400" : "bg-white/8 text-white/70",
          )}
        >
          {success ? (
            <CheckCircle2 className="size-7" />
          ) : error ? (
            <AlertCircle className="size-7" />
          ) : (
            <Loader2 className="size-7 animate-spin" />
          )}
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">{PRODUCT_NAME}</p>
        <h1 className="mt-3 text-xl font-semibold text-white/90">
          {success ? "Connected" : error ? "Connection failed" : "Finishing up"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">{message}</p>
        <p className="mt-6 text-xs text-white/30">Redirecting…</p>
      </div>
    </div>
  );
}

export default function OAuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="dark flex min-h-screen items-center justify-center bg-[#070707] text-white/50">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <OAuthCompleteContent />
    </Suspense>
  );
}
