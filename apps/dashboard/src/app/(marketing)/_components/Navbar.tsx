"use client";

import { useState } from "react";
import Link from "next/link";
import { Store } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { AuthNavLinks } from "./AuthNavLinks";
import { MegaMenuSlotContext, MobileNav, NavLinks } from "./NavLinks";

const WORDMARK = PRODUCT_NAME.toLowerCase();

function LogoLink() {
  return (
    <Link href="/" aria-label={PRODUCT_NAME} className="m-nav-logo shrink-0 justify-self-start">
      <Store className="size-7" strokeWidth={1.75} aria-hidden />
      <span className="m-nav-wordmark" aria-hidden>
        {WORDMARK}
      </span>
    </Link>
  );
}

export function Navbar() {
  const [megaSlot, setMegaSlot] = useState<HTMLDivElement | null>(null);

  return (
    <MegaMenuSlotContext.Provider value={megaSlot}>
      <header className="m-nav">
        <nav aria-label="Main" className="m-nav-bar">
          <LogoLink />
          <NavLinks />
          <div className="m-nav-actions">
            <AuthNavLinks />
            <MobileNav />
          </div>
        </nav>
        <div
          ref={setMegaSlot}
          className="pointer-events-none absolute inset-x-0 top-full z-50 mx-auto max-w-6xl px-5 sm:px-6"
        />
      </header>
    </MegaMenuSlotContext.Provider>
  );
}
