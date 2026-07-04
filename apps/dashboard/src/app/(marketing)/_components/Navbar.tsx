import Link from "next/link";
import { Store } from "lucide-react";
import { AuthNavLinks } from "./AuthNavLinks";
import { NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 px-4 pt-3 sm:pt-4">
      <nav className="m-navbar-pill mx-auto flex max-w-5xl items-center gap-4 rounded-full px-4 py-2.5 sm:px-6">
        <div className="flex flex-1 items-center">
          <Link
            href="/"
            aria-label="Shopkeeper"
            className="flex size-10 shrink-0 items-center justify-center text-[#2b2118] no-underline transition-colors hover:text-stone-600"
          >
            <Store className="size-6" strokeWidth={1.75} />
          </Link>
        </div>

        <div className="hidden shrink-0 md:block">
          <NavLinks />
        </div>

        <div className="flex flex-1 items-center justify-end gap-4">
          <AuthNavLinks />
        </div>
      </nav>
    </header>
  );
}
