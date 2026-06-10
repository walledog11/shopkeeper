"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const signInLinkClass =
  "hidden sm:inline-flex items-center px-1 py-2 text-[15px] font-medium text-[#2b2118] hover:text-stone-600 transition-colors";

const primaryLinkClass = "m-glass-btn m-glass-btn-primary px-5 py-2.5 text-sm";

export function AuthNavLinks() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) {
    return (
      <>
        <Link href="/login" className={signInLinkClass}>
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
      <Link href="/dashboard" className={signInLinkClass}>
        Dashboard
      </Link>
      <Link href="/login" className={primaryLinkClass}>
        Switch account
      </Link>
    </>
  );
}
