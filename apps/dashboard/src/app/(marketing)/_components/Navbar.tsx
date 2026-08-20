"use client";

import { useState } from "react";
import Link from "next/link";
import { Store } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { AuthNavLinks } from "./AuthNavLinks";
import { MegaMenuSlotContext, MobileNav, NavLinks } from "./NavLinks";

const WORDMARK = PRODUCT_NAME.toLowerCase();

function LogoLink({ chip = false }: { chip?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={PRODUCT_NAME}
      className={chip ? "m-nav-logo m-nav-logo-chip" : "m-nav-logo w-fit shrink-0 justify-self-start"}
    >
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
      <header className="relative sticky top-0 z-30 px-4 pt-3 sm:px-8 sm:pt-5">
        <div aria-hidden className="m-nav-fade pointer-events-none absolute inset-x-0 top-0 h-20" />

        <div className="relative z-[2] flex items-center justify-between gap-3 md:hidden">
          <LogoLink chip />
          <div className="flex items-center gap-2">
            <AuthNavLinks />
            <MobileNav />
          </div>
        </div>

        <nav className="m-navbar-pill relative z-[2] mx-auto hidden w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center rounded-full py-1.5 pl-5 pr-1.5 md:grid sm:pl-6 sm:pr-2">
          <LogoLink />
          <NavLinks />
          <div className="m-nav-actions col-start-3 w-fit shrink-0 justify-self-end">
            <AuthNavLinks />
          </div>
        </nav>
        <div
          ref={setMegaSlot}
          className="pointer-events-none absolute inset-x-5 top-full z-50 mx-auto w-auto max-w-7xl sm:inset-x-8"
        />
      </header>
    </MegaMenuSlotContext.Provider>
  );
}
