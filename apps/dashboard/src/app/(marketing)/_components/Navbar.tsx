import Link from "next/link";
import { Store } from "lucide-react";
import { AuthNavLinks } from "./AuthNavLinks";
import { MobileNav, NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 px-4 pt-3 sm:pt-4">
      <div aria-hidden className="m-nav-fade pointer-events-none absolute inset-x-0 top-0 h-20" />
      <nav className="m-navbar-pill relative mx-auto flex max-w-4xl items-center justify-between gap-2 rounded-full px-3 py-2 sm:gap-4 sm:px-5 sm:py-2.5">
        <div className="flex items-center md:flex-1">
          <Link
            href="/"
            aria-label="Shopkeeper"
            className="flex shrink-0 items-center gap-2 px-1 text-[#2b2118] no-underline transition-colors hover:text-[var(--m-quill)]"
          >
            <Store className="size-6" strokeWidth={1.75} />
            <span className="translate-y-[0.06em] text-[26px] leading-none tracking-[0.03em] [font-family:var(--m-hand)] max-[359px]:hidden">
              shopkeeper
            </span>
          </Link>
        </div>

        <div className="hidden shrink-0 md:block">
          <NavLinks />
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3 md:flex-1">
          <AuthNavLinks />
          <MobileNav />
        </div>
      </nav>
    </header>
  );
}
