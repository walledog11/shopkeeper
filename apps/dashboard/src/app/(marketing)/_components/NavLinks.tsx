"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { Menu, Store, X } from "lucide-react";
import { PRIMARY_CTA_LABEL, PRODUCT_NAME } from "@/lib/brand";
import { DASHBOARD_HREF, LOGIN_HREF } from "./app-links";
import { ButtonLink } from "./ButtonLink";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function NavLinks() {
  return (
    <div className="m-nav-links">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="m-nav-link">
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Focus goes back to the menu button when the sheet is dismissed, not when a
  // link in it is followed: after an in-page link the browser has already moved
  // focus to the section it scrolled to.
  const dismissed = useRef(false);
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (!open) return;

    // A native modal dialog makes the page behind it inert and handles Escape.
    const sheet = sheetRef.current;
    if (sheet && !sheet.open) sheet.showModal();
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    sheetRef.current?.close();
  }

  function dismiss() {
    dismissed.current = true;
    close();
  }

  function onClosed() {
    setOpen(false);
    if (!dismissed.current) return;
    dismissed.current = false;
    triggerRef.current?.focus();
  }

  const sheet = (
    <dialog
      ref={sheetRef}
      className="m-nav-sheet"
      aria-label="Menu"
      onCancel={() => {
        dismissed.current = true;
      }}
      onClose={onClosed}
    >
      <div className="m-nav-sheet-bar">
        <Link href="/" aria-label={PRODUCT_NAME} className="m-nav-logo" onClick={close}>
          <Store className="size-7" strokeWidth={1.75} aria-hidden />
          <span className="m-nav-wordmark" aria-hidden>
            {PRODUCT_NAME.toLowerCase()}
          </span>
        </Link>
        <button
          ref={closeRef}
          type="button"
          className="m-nav-menu-btn"
          aria-label="Close menu"
          onClick={dismiss}
        >
          <X className="size-5" strokeWidth={2} />
        </button>
      </div>

      <nav className="m-nav-sheet-list">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="m-nav-sheet-item" onClick={close}>
            {link.label}
          </Link>
        ))}
        <Link href={isSignedIn ? DASHBOARD_HREF : LOGIN_HREF} className="m-nav-sheet-item" onClick={close}>
          {isSignedIn ? "Dashboard" : "Log in"}
        </Link>
      </nav>

      <ButtonLink href="/#waitlist" variant="primary" size="lg" className="m-nav-sheet-cta" onClick={close}>
        {PRIMARY_CTA_LABEL}
      </ButtonLink>
    </dialog>
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
      {/* Portal into the page wrapper, not <body>: the font and color tokens the
          sheet reads are declared on `.m-page`. */}
      {open ? createPortal(sheet, document.querySelector<HTMLElement>(".m-page") ?? document.body) : null}
    </div>
  );
}
