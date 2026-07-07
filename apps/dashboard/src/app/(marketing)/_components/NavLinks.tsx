"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleHelp,
  Heart,
  LayoutGrid,
  Mail,
  Menu,
  Sunrise,
  Tag,
  X,
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
    subtitle: "Instagram, email & iMessage",
    icon: Heart,
  },
  {
    href: "#briefing",
    title: "Morning briefing",
    subtitle: "Wake up to work already done",
    icon: Sunrise,
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

/* Menu keyboard behavior shared by the desktop dropdowns and the mobile menu:
   outside-click / Escape to close (Escape hands focus back to the trigger),
   ArrowDown on the trigger opens and focuses the first item, ArrowUp/ArrowDown
   cycle through the items. */
function useMenuKeyboard(
  open: boolean,
  setOpen: (value: boolean) => void,
  rootRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
) {
  const focusFirstOnOpen = useRef(false);

  useEffect(() => {
    if (!open) return;

    if (focusFirstOnOpen.current) {
      focusFirstOnOpen.current = false;
      rootRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen, rootRef, triggerRef]);

  return function onArrowKeys(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      focusFirstOnOpen.current = true;
      setOpen(true);
      return;
    }
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? items[(index + 1) % items.length]
        : items[index <= 0 ? items.length - 1 : index - 1];
    next.focus();
  };
}

function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onArrowKeys = useMenuKeyboard(open, setOpen, rootRef, triggerRef);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={onArrowKeys}
    >
      <button
        ref={triggerRef}
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
          "m-nav-pop absolute left-0 top-full z-50 w-[min(100vw-2rem,19rem)] pt-3",
          open && "m-nav-pop-open",
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
        Contact
      </Link>
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onArrowKeys = useMenuKeyboard(open, setOpen, rootRef, triggerRef);

  const Icon = open ? X : Menu;

  return (
    <div ref={rootRef} className="relative md:hidden" onKeyDown={onArrowKeys}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex size-9 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#2b2118]"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon className="size-5" strokeWidth={2} />
      </button>

      <div
        className={cn(
          "m-nav-pop absolute right-0 top-full z-50 w-[min(100vw-2.5rem,17rem)] pt-4",
          open && "m-nav-pop-open",
        )}
      >
        <div className="m-nav-dropdown" role="menu">
          {[...productItems, ...resourceItems].map((item) => {
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="m-nav-dropdown-item items-center py-2.5"
                onClick={() => setOpen(false)}
              >
                <ItemIcon className="m-nav-dropdown-icon mt-0 size-[18px] shrink-0" strokeWidth={1.75} />
                <span className="m-nav-dropdown-title">{item.title}</span>
              </Link>
            );
          })}
          <Link
            href={`mailto:${CONTACT_EMAIL}`}
            role="menuitem"
            className="m-nav-dropdown-item items-center py-2.5"
            onClick={() => setOpen(false)}
          >
            <Mail className="m-nav-dropdown-icon mt-0 size-[18px] shrink-0" strokeWidth={1.75} />
            <span className="m-nav-dropdown-title">Contact</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
