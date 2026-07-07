"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OAuthPopupShell } from "@/components/integrations/OAuthPopupShell";
import { OAUTH_ERROR_MESSAGES } from "@/lib/integrations/catalog";
import {
  finishOAuthPopup,
  isOAuthPopupWindow,
  markOAuthPopupSession,
  OAUTH_DONE_MESSAGE_TYPE,
} from "@/lib/integrations/oauth-flow";

const CONNECTED_VALUES = new Set(["instagram", "shopify", "gmail", "outlook", "tiktok-shop"]);

const CONNECTED_LABELS: Record<string, string> = {
  shopify: "Shopify",
  instagram: "Instagram",
  gmail: "Gmail",
  outlook: "Outlook",
  "tiktok-shop": "TikTok Shop",
};

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
  const [closeBlocked, setCloseBlocked] = useState(false);

  useEffect(() => {
    if (isOAuthPopupWindow()) {
      markOAuthPopupSession();
    }
  }, []);

  useEffect(() => {
    const payload = {
      type: OAUTH_DONE_MESSAGE_TYPE as typeof OAUTH_DONE_MESSAGE_TYPE,
      connected,
      error,
    };

    const timer = window.setTimeout(() => {
      if (isOAuthPopupWindow()) {
        finishOAuthPopup(payload);
        window.setTimeout(() => {
          if (!window.closed) setCloseBlocked(true);
        }, 300);
        return;
      }

      const nextUrl = new URL("/dashboard/integrations", window.location.origin);
      if (connected) nextUrl.searchParams.set("connected", connected);
      if (error) nextUrl.searchParams.set("error", error);
      window.location.replace(`${nextUrl.pathname}${nextUrl.search}`);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [connected, error]);

  const success = Boolean(connected) && !error;
  const integrationLabel = connected ? CONNECTED_LABELS[connected] ?? "Integration" : null;
  const title = success
    ? `${integrationLabel} connected`
    : error
      ? "Connection failed"
      : "Finishing up";
  const message = success
    ? "You're all set. Returning you to Shopkeeper."
    : OAUTH_ERROR_MESSAGES[error ?? ""] ?? "Something went wrong. Returning you to Shopkeeper.";
  const footer = closeBlocked
    ? "You can close this window and return to Shopkeeper."
    : success || error
      ? "Closing this window…"
      : "Just a moment…";
  const state = success ? "success" : error ? "error" : "loading";

  return <OAuthPopupShell title={title} message={message} footer={footer} state={state} />;
}

export default function OAuthCompletePage() {
  return (
    <Suspense
      fallback={
        <OAuthPopupShell
          title="Finishing up"
          message="Completing your connection."
          footer="Just a moment…"
          state="loading"
        />
      }
    >
      <OAuthCompleteContent />
    </Suspense>
  );
}
