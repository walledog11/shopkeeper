"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const signInLinkClass =
  "hidden sm:inline-flex items-center py-2 px-4 rounded-full text-sm font-semibold border border-solid border-stone-500 text-stone-900 hover:text-stone-300 hover:border-stone-400 transition-colors";

const primaryLinkClass =
  "inline-flex items-center py-2 px-4 rounded-full text-sm font-semibold bg-stone-900 text-stone-100 border border-solid border-stone-500";

export function AuthNavLinks() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) {
    return (
      <>
        <Link href="/login" className={signInLinkClass}>
          Sign in
        </Link>
        <Link href="/signup" className={primaryLinkClass}>
          Start free →
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
