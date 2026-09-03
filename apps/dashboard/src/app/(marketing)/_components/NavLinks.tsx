"use client";

import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Menu,
  MessageCircle,
  ShieldCheck,
  Store,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { PRIMARY_CTA_LABEL, PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/ui/cn";

type ProductCard = {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

type Partner = {
  href: string;
  name: string;
  logo: string;
};

const productCards: ProductCard[] = [
  {
    href: "/product/order-operations",
    title: "Order operations",
    subtitle: "See the Shopify work Shopkeeper can prepare and complete.",
    icon: Store,
  },
  {
    href: "/product/customer-support",
    title: "Customer support",
    subtitle: "Answer from orders, inventory, policies, and approved voice guidance.",
    icon: MessageCircle,
  },
  {
    href: "/product/approvals-and-controls",
    title: "Approvals and controls",
    subtitle: "Set the rules for what can reply, what must ask, and what stays blocked.",
    icon: ShieldCheck,
  },
  {
    href: "/product/integrations",
    title: "Integrations",
    subtitle: "Follow a request from the customer channel to Shopify and the action log.",
    icon: Workflow,
  },
];

const partners: Partner[] = [
  { href: "/product/integrations", name: "Shopify", logo: "/logos/shopify.svg" },
  {
    href: "/product/integrations",
    name: "Instagram",
    logo: "/logos/instagram-outline.svg",
  },
  { href: "/product/integrations", name: "Email", logo: "/logos/email.svg" },
  { href: "/product/integrations", name: "iMessage", logo: "/logos/imessage.svg" },
];

/* Slot outside the frosted navbar pill — backdrop-filter on a descendant of
   another backdrop-filter (or a `translate`) cannot see the page behind it. */
export const MegaMenuSlotContext = createContext<HTMLElement | null>(null);

/* Menu keyboard behavior shared by the desktop dropdowns and the mobile menu:
   outside-click / Escape to close (Escape hands focus back to the trigger),
   ArrowDown on the trigger opens and focuses the first item, ArrowUp/ArrowDown
   cycle through the items. */
function useMenuKeyboard(
  open: boolean,
  setOpen: (value: boolean) => void,
  rootRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  panelRef?: React.RefObject<HTMLDivElement | null>,
) {
  const focusFirstOnOpen = useRef(false);

  useEffect(() => {
    if (!open) return;

    if (focusFirstOnOpen.current) {
      focusFirstOnOpen.current = false;
      (panelRef?.current ?? rootRef.current)
        ?.querySelector<HTMLElement>("[role=menuitem]")
        ?.focus();
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef?.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (
        rootRef.current?.contains(document.activeElement) ||
        panelRef?.current?.contains(document.activeElement)
      ) {
        triggerRef.current?.focus();
      }
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen, rootRef, triggerRef, panelRef]);

  return function onArrowKeys(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      focusFirstOnOpen.current = true;
      setOpen(true);
      return;
    }
    const items = Array.from(
      (panelRef?.current ?? rootRef.current)?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
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

/* Open immediately; delay close so the pointer can cross the gap between the
   Product trigger and a panel that's positioned against the whole pill. */
function useHoverMenu(setOpen: (value: boolean) => void) {
  const timeoutRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  return {
    openMenu() {
      window.clearTimeout(timeoutRef.current);
      setOpen(true);
    },
    closeMenu() {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setOpen(false), 180);
    },
  };
}

function ProductMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const slot = useContext(MegaMenuSlotContext);
  const onArrowKeys = useMenuKeyboard(open, setOpen, rootRef, triggerRef, panelRef);
  const { openMenu, closeMenu } = useHoverMenu(setOpen);

  const panel = (
    <div
      ref={panelRef}
      className={cn("m-nav-pop m-nav-pop-glass pt-2", open && "m-nav-pop-open")}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <div id="m-nav-product-menu" className="m-nav-mega" role="menu">
          <div className="m-nav-mega-cards">
            {productCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  role="menuitem"
                  className="m-nav-mega-card"
                  onClick={() => setOpen(false)}
                >
                  <span className="m-nav-mega-card-icon">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="m-nav-mega-card-title">
                    {card.title}
                  </span>
                  <ArrowUpRight
                    className="m-nav-mega-arrow size-3.5"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="m-nav-mega-card-subtitle">{card.subtitle}</span>
                </Link>
              );
            })}
          </div>

          <div className="m-nav-mega-rail">
            <div className="m-nav-mega-rail-label">Works with</div>
            {partners.map((partner) => (
              <Link
                key={partner.name}
                href={partner.href}
                role="menuitem"
                className="m-nav-mega-partner"
                onClick={() => setOpen(false)}
              >
                <span className="m-nav-mega-partner-logo">
                  <Image
                    src={partner.logo}
                    alt=""
                    width={16}
                    height={16}
                    className="size-4 object-contain"
                  />
                </span>
                <span className="m-nav-mega-partner-name">{partner.name}</span>
              </Link>
            ))}
            <Link
              href="/product/integrations"
              role="menuitem"
              className="m-nav-mega-more"
              onClick={() => setOpen(false)}
            >
              See how the system fits together
            </Link>
          </div>
        </div>
      </div>
    );


  return (
    <div ref={rootRef} className="flex w-fit shrink-0" onKeyDown={onArrowKeys}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="m-nav-product-menu"
        className="m-nav-trigger"
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
      >
        Product
        <ChevronDown
          className={cn("size-4 stroke-[2.25] transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {slot ? createPortal(panel, slot) : null}
    </div>
  );
}

export function NavLinks() {
  return (
    <div className="m-nav-links">
      <ProductMenu />
      <Link href="/product/security" className="m-nav-link">
        Security
      </Link>
      <Link href="/#pricing" className="m-nav-link">
        Pricing
      </Link>
      <Link href="/#faq" className="m-nav-link">
        FAQ
      </Link>
    </div>
  );
}

const WORDMARK = PRODUCT_NAME.toLowerCase();

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (!open) {
      setProductOpen(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  const sheet = (
    <div
      className="m-nav-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div className="m-nav-sheet-bar">
        <Link href="/" aria-label={PRODUCT_NAME} className="m-nav-logo" onClick={close}>
          <Store className="size-7" strokeWidth={1.75} aria-hidden />
          <span className="m-nav-wordmark" aria-hidden>
            {WORDMARK}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/signup" className="m-nav-cta" onClick={close}>
            {PRIMARY_CTA_LABEL}
          </Link>
          <button
            ref={closeRef}
            type="button"
            className="m-nav-menu-btn"
            aria-label="Close menu"
            onClick={close}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <nav className="m-nav-sheet-list">
        <button
          type="button"
          className="m-nav-sheet-item"
          aria-expanded={productOpen}
          onClick={() => setProductOpen((value) => !value)}
        >
          Product
          <ChevronRight
            className={cn("size-5 shrink-0 transition-transform duration-200", productOpen && "rotate-90")}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {productOpen ? (
          <div className="m-nav-sheet-sub">
            {productCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="m-nav-sheet-subitem"
                onClick={close}
              >
                {card.title}
              </Link>
            ))}
          </div>
        ) : null}

        <Link href="/#pricing" className="m-nav-sheet-item" onClick={close}>
          Pricing
        </Link>
        <Link href="/product/security" className="m-nav-sheet-item" onClick={close}>
          Security
        </Link>
        <Link href="/#faq" className="m-nav-sheet-item" onClick={close}>
          FAQ
        </Link>
        {isSignedIn ? (
          <Link href="/dashboard" className="m-nav-sheet-item" onClick={close}>
            Dashboard
          </Link>
        ) : (
          <Link href="/login" className="m-nav-sheet-item" onClick={close}>
            Log in
          </Link>
        )}
      </nav>

      <Link href="/signup" className="m-nav-sheet-cta" onClick={close}>
        {PRIMARY_CTA_LABEL}
      </Link>
    </div>
  );

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open menu"
        className="m-nav-menu-btn"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" strokeWidth={2} />
      </button>
      {open ? createPortal(sheet, document.body) : null}
    </div>
  );
}
