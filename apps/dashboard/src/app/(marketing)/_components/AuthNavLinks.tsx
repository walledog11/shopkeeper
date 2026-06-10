"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const signInLinkClass =
  "hidden sm:inline-flex items-center px-3 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors";

const primaryLinkClass =
  "inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-[#f6f2eb] hover:bg-stone-700 transition-colors";

export function AuthNavLinks() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) {
    return (
      <>
        <Link href="/login" className={signInLinkClass}>
          Sign in
        </Link>
        <Link href="/signup" className={primaryLinkClass}>
          Start free
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard" className={signInLinkClass}>
        Dashboard
      </Link>
      <Link href="/login" className={primaryLinkClass}>
        Switch account
      </Link>
    </>
  );
}
