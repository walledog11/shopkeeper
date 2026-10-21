"use client";

import { useState } from "react";
import { ShopkeeperLogo } from "@/components/ShopkeeperLogo";
import { AuthNavLinks } from "./AuthNavLinks";
import { MegaMenuSlotContext, MobileNav, NavLinks } from "./NavLinks";

export function Navbar() {
  const [megaSlot, setMegaSlot] = useState<HTMLDivElement | null>(null);

  return (
    <MegaMenuSlotContext.Provider value={megaSlot}>
      <header className="m-nav">
        <nav aria-label="Main" className="m-nav-bar">
          <ShopkeeperLogo className="justify-self-start" />
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
