"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { ChevronDown, CircleHelp, LogOut, Plus, Settings2, User } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { mobileNavSections, organizationSettingsNavItem } from "../nav-items";
import { usePanelBriefingData } from "../agent-panel/usePanelBriefingData";
import { useHelp } from "../help/HelpContext";
import { NavGroupList } from "../sidebar/NavGroupList";
import {
  dashboardChromeMaxWidthClass,
  desktopTopBarPillClass,
  mobileNavGroupCardClass,
  mobileNavLinkClass,
} from "../sidebar/sidebar-helpers";
import type { NavAuth } from "../sidebar/useNavAuth";
import { resolveMobileRouteTitle } from "./resolveMobileRouteTitle";

const ACCOUNT_SETTINGS_HREF = "/dashboard/settings#account";

const belowNavPanelStyle = {
  top: "var(--dashboard-mobile-nav-offset, 0px)",
  height: "calc(100dvh - var(--dashboard-mobile-nav-offset, 0px))",
} as const;

const panelTransition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };
const backdropTransition = { duration: 0.2, ease: "easeOut" as const };

type OrganizationMembership = {
  organization: {
    id: string;
    name: string;
  };
};

export function MobileHubNavDropdown({
  open,
  onOpenChange,
  openCount,
  onSwitching,
  navAuth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();
  const routeTitle = resolveMobileRouteTitle(pathname);
  const [portalReady, setPortalReady] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { summary } = usePanelBriefingData(open);
  const needsYouCount = summary.metrics.needsYouCount;
  const { openHelp } = useHelp();
  const { organization, userMemberships, setActive, mounted, signOut, fullName } = navAuth;
  const memberships = userMemberships.data as OrganizationMembership[] | undefined;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => onOpenChange(false);

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    close();
  };

  const handleOpenHelp = () => {
    close();
    openHelp();
  };

  const handleLogOut = () => {
    close();
    void signOut({ redirectUrl: "/login" });
  };

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === organization?.id || !setActive) return;

    close();
    onSwitching(true);

    try {
      await setActive({ organization: organizationId });
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch organization", error);
      onSwitching(false);
    }
  };

  const backdropMotion = prefersReducedMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: backdropTransition,
      };

  const panelMotion = prefersReducedMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: panelTransition,
      };

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(
          desktopTopBarPillClass,
          "group min-w-0 flex-1 justify-center gap-1.5 px-4 outline-none",
        )}
      >
        <span className="truncate text-sm font-semibold text-sidebar-foreground">{routeTitle}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-sidebar-foreground/40 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {portalReady
        ? createPortal(
            <LazyMotion features={domAnimation}>
              <AnimatePresence>
                {open ? (
                  <>
                    <m.button
                      key="mobile-nav-backdrop"
                      type="button"
                      aria-label="Close navigation"
                      className="fixed inset-x-0 bottom-0 z-[60] bg-foreground/[0.06]"
                      style={belowNavPanelStyle}
                      onClick={close}
                      {...backdropMotion}
                    />

                    <m.div
                      key="mobile-nav-panel"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Navigation"
                      className={cn(
                        "fixed inset-x-0 bottom-0 z-[60] flex flex-col overflow-hidden border-t border-border/80",
                        "bg-sidebar/95 backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/85",
                      )}
                      style={belowNavPanelStyle}
                      {...panelMotion}
                    >
                      <div className="min-h-0 flex-1 overflow-y-auto">
                        <div className={cn("mx-auto w-full px-5 pb-6 pt-3", dashboardChromeMaxWidthClass)}>
                          <NavGroupList
                            sections={mobileNavSections}
                            pathname={pathname}
                            needsYouCount={needsYouCount}
                            openCount={openCount}
                            onNavigate={handleNavClick}
                          />

                          <div className="mt-5 flex flex-col gap-2">
                            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                              Organization
                            </p>
                            <div className={mobileNavGroupCardClass}>
                              {mounted &&
                                memberships?.map((mem) => {
                                  const isActive = mem.organization.id === organization?.id;

                                  return (
                                    <button
                                      key={mem.organization.id}
                                      type="button"
                                      onClick={() => switchOrganization(mem.organization.id)}
                                      className={mobileNavLinkClass(isActive)}
                                    >
                                      <span className="flex-1 truncate text-sm leading-tight">{mem.organization.name}</span>
                                      {isActive && <span className="size-1.5 shrink-0 rounded-full bg-green-600" />}
                                    </button>
                                  );
                                })}
                              <Link
                                href="/create-workspace"
                                onClick={close}
                                className={mobileNavLinkClass(false)}
                              >
                                <Plus className="size-[18px] shrink-0 stroke-[1.5] text-sidebar-foreground/70" />
                                <span className="flex-1 text-sm font-medium leading-tight">Add organization</span>
                              </Link>
                              <Link
                                href={organizationSettingsNavItem.href}
                                onClick={close}
                                className={mobileNavLinkClass(false)}
                              >
                                <Settings2 className="size-[18px] shrink-0 stroke-[1.5] text-sidebar-foreground/70" />
                                <span className="flex-1 text-sm font-medium leading-tight">Organization settings</span>
                              </Link>
                            </div>
                          </div>

                          <div className="mt-5">
                            <div className={mobileNavGroupCardClass}>
                              <Link
                                href={ACCOUNT_SETTINGS_HREF}
                                onClick={close}
                                className={mobileNavLinkClass(false)}
                              >
                                <User className="size-[18px] shrink-0 stroke-[1.5] text-sidebar-foreground/70" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium leading-tight">Account settings</p>
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{fullName}</p>
                                </div>
                              </Link>
                              <button type="button" onClick={handleOpenHelp} className={mobileNavLinkClass(false)}>
                                <CircleHelp className="size-[18px] shrink-0 stroke-[1.5] text-sidebar-foreground/70" />
                                <span className="flex-1 text-sm font-medium leading-tight">Help</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleLogOut}
                                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-sidebar-accent/80"
                              >
                                <LogOut className="size-[18px] shrink-0 stroke-[1.5]" />
                                <span className="flex-1 leading-tight">Log out</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </m.div>
                  </>
                ) : null}
              </AnimatePresence>
            </LazyMotion>,
            document.body,
          )
        : null}
    </>
  );
}
