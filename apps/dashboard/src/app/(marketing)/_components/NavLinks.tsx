"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleHelp,
  Heart,
  LayoutGrid,
  ShoppingBag,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/brand";
import { cn } from "@/lib/ui/cn";

type NavItem = {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

const productItems: NavItem[] = [
  {
    href: "#how",
    title: "How it works",
    subtitle: "See Shopkeeper in action",
    icon: LayoutGrid,
  },
  {
    href: "#channels",
    title: "Channels",
    subtitle: "Instagram, email & SMS",
    icon: Heart,
  },
  {
    href: "#integrations",
    title: "Integrations",
    subtitle: "Connect apps & services",
    icon: ShoppingBag,
  },
];

const resourceItems: NavItem[] = [
  {
    href: "#pricing",
    title: "Pricing",
    subtitle: "Plans for every stage",
    icon: Tag,
  },
  {
    href: "#faq",
    title: "FAQ",
    subtitle: "Common questions answered",
    icon: CircleHelp,
  },
];

function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        className="m-nav-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDown
          className={cn("size-3.5 stroke-[2.25] transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          "absolute left-0 top-full z-50 w-[min(100vw-2rem,19rem)] pt-3",
          !open && "pointer-events-none invisible",
        )}
      >
        <div className="m-nav-dropdown" role="menu">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="m-nav-dropdown-item"
                onClick={() => setOpen(false)}
              >
                <Icon className="m-nav-dropdown-icon size-[18px] shrink-0" strokeWidth={1.75} />
                <span>
                  <span className="m-nav-dropdown-title">{item.title}</span>
                  <span className="m-nav-dropdown-subtitle">{item.subtitle}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function NavLinks() {
  return (
    <div className="hidden items-center gap-8 md:flex">
      <NavDropdown label="Product" items={productItems} />
      <NavDropdown label="Resources" items={resourceItems} />
      <Link href={`mailto:${CONTACT_EMAIL}`} className="m-nav-link">
        Company
      </Link>
    </div>
  );
}
