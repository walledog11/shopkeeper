"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";
import { HeaderSearch } from "../header-search/HeaderSearch";
import { Logo } from "../sidebar/Logo";
import type { NavAuth } from "../sidebar/useNavAuth";
import {
  dashboardChromeMaxWidthClass,
  desktopTopBarUtilityPillClass,
} from "../sidebar/sidebar-helpers";
import { MobileHubNavDropdown } from "./MobileHubNavDropdown";

function observeLayoutShift(element: HTMLElement, onChange: () => void) {
  onChange();

  const observer = new ResizeObserver(onChange);
  observer.observe(element);

  let parent = element.parentElement;
  while (parent) {
    observer.observe(parent);
    parent = parent.parentElement;
  }

  window.addEventListener("resize", onChange);
  window.addEventListener("scroll", onChange, true);

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", onChange);
    window.removeEventListener("scroll", onChange, true);
  };
}

export function MobileHubHeader({
  onSwitching,
  navAuth,
}: {
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const updateOffset = () => {
      const bottom = element.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty("--dashboard-mobile-nav-offset", `${bottom}px`);
    };

    return observeLayoutShift(element, updateOffset);
  }, []);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--dashboard-mobile-nav-offset");
    };
  }, []);

  return (
    <div
      ref={headerRef}
      data-dashboard-mobile-hub
      className="sticky top-0 z-[70] md:hidden w-full shrink-0 bg-transparent pt-2 pb-2"
    >
      <div className={cn("mx-auto w-full px-5", dashboardChromeMaxWidthClass)}>
        <header
          data-dashboard-mobile-header
          className="flex w-full items-center gap-2"
        >
          <div className={cn(desktopTopBarUtilityPillClass, "shrink-0 px-3")}>
            <Logo iconOnly inPill onClick={() => setNavOpen(false)} />
          </div>

          <MobileHubNavDropdown
            open={navOpen}
            onOpenChange={setNavOpen}
            onSwitching={onSwitching}
            navAuth={navAuth}
          />

          <div className={cn(desktopTopBarUtilityPillClass, "shrink-0 px-1")}>
            <HeaderSearch variant="mobile" />
          </div>
        </header>
      </div>
    </div>
  );
}
