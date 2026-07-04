"use client";

import Link, { useLinkStatus } from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

const quietLinkClass =
  "inline-flex items-center px-1 py-2 text-[15px] font-medium text-[#2b2118] hover:text-stone-600 transition-colors";

const primaryLinkClass = "m-glass-btn m-glass-btn-primary px-5 py-2.5 text-sm";

function DashboardLinkContent() {
  const { pending } = useLinkStatus();

  return (
    <span
      className="inline-flex min-w-[5.5rem] items-center justify-center gap-2"
      aria-busy={pending}
      aria-live="polite"
    >
      {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
      {pending ? "Opening…" : "Dashboard"}
    </span>
  );
}

export function AuthNavLinks() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) {
    return (
      <>
        <Link href="/login" className={quietLinkClass}>
          Log in
        </Link>
        <Link href="/signup" className={primaryLinkClass}>
          Get Started
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className={quietLinkClass}>
        Switch account
      </Link>
      <Link href="/dashboard" className={primaryLinkClass}>
        <DashboardLinkContent />
      </Link>
    </>
  );
}
