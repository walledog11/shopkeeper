import Link from "next/link";
import { Store } from "lucide-react";
import { AuthNavLinks } from "./AuthNavLinks";
import { NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 px-4 pt-3 sm:pt-4">
      <nav className="m-navbar-pill mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full px-3 py-2 sm:gap-4 sm:px-5 sm:py-2.5">
        <div className="flex items-center md:flex-1">
          <Link
            href="/"
            aria-label="Shopkeeper"
            className="flex size-9 shrink-0 items-center justify-center text-[#2b2118] no-underline transition-colors hover:text-stone-600 sm:size-10"
          >
            <Store className="size-6" strokeWidth={1.75} />
          </Link>
        </div>

        <div className="hidden shrink-0 md:block">
          <NavLinks />
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3 md:flex-1">
          <AuthNavLinks />
        </div>
      </nav>
    </header>
  );
}
