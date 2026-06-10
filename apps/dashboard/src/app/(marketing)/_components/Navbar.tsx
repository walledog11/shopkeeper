import Link from "next/link";
import { Store } from "lucide-react";
import { AuthNavLinks } from "./AuthNavLinks";
import { NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-900/[0.08] bg-[#faf6ef]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#faf6ef]/88">
      <nav className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center px-6 py-4 md:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="flex items-center gap-2 text-[24px] leading-none tracking-tight text-[#2b2118] no-underline [font-family:var(--m-serif)]"
        >
          <Store className="size-6" strokeWidth={1.8} />
          shopkeeper
        </Link>

        <NavLinks />

        <div className="flex items-center justify-end gap-4">
          <AuthNavLinks />
        </div>
      </nav>
    </header>
  );
}
