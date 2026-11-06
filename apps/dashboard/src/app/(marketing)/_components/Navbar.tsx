import { ShopkeeperLogo } from "@/components/ShopkeeperLogo";
import { AuthNavLinks } from "./AuthNavLinks";
import { MobileNav, NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="m-nav">
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
