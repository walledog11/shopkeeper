import { ShopkeeperLogo } from "@/components/ShopkeeperLogo";
import { AuthNavLinks } from "./AuthNavLinks";
import { MobileNav, NavLinks } from "./NavLinks";
import { NavTone } from "./NavTone";

/** `tone` is the first paint; NavTone follows the sections under the bar after that. */
export function Navbar({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <header className="m-nav" data-tone={tone}>
      <NavTone />
      <nav aria-label="Main" className="m-nav-bar">
        <ShopkeeperLogo className="justify-self-start" />
        <NavLinks />
        <div className="m-nav-actions">
          <AuthNavLinks />
          <MobileNav />
        </div>
      </nav>
    </header>
  );
}
