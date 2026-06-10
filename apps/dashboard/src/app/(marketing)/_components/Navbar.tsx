import Link from "next/link";
import { Store } from "lucide-react";
import { AuthNavLinks } from "./AuthNavLinks";
import { NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-900/[0.08] bg-[#faf6ef]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#faf6ef]/88">
      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          aria-label="Shopkeeper"
          className="relative z-10 flex size-11 shrink-0 items-center justify-center text-[#2b2118] no-underline transition-colors hover:text-stone-600"
        >
          <Store className="size-7" strokeWidth={1.75} />
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
          <NavLinks />
        </div>

        <div className="relative z-10 flex min-w-11 items-center justify-end gap-4">
          <AuthNavLinks />
        </div>
      </nav>
    </header>
  );
}
