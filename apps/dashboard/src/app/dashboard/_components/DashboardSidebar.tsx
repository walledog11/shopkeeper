"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import useSWR from "swr";
import { Bot, Box, ChevronDown, Inbox, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { useOpenThreadCountQuery } from "@/hooks/useThreads";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";

import { footerNavItems, navGroups } from "./nav-items";
import { useAgentPanel } from "./agent-panel/AgentPanelContext";
import { useCommandPalette } from "./CommandPaletteContext";
import { fetcher } from "@/lib/api/fetcher";
import { formatRole } from "@/lib/format/role";
import { cn } from "@/lib/ui/cn";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgAvatar } from "@/components/OrgAvatar";

const OpenThreadCountContext = createContext(0);
export const useOpenThreadCount = () => useContext(OpenThreadCountContext);

type NavAuth = ReturnType<typeof useNavAuth>;
type WorkspaceMembership = {
  organization: {
    id: string;
    name: string;
    imageUrl?: string | null;
  };
};

function useNavAuth() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization, membership, memberships } = useOrganization({
    memberships: { infinite: false, pageSize: 20 },
  });
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
  const { data: orgData } = useSWR<{ planName?: string }>("/api/org", fetcher, {
    revalidateOnFocus: false,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const membershipPage = memberships as { count?: number; data?: unknown[] } | undefined;
  const seatCount = membershipPage?.count ?? membershipPage?.data?.length ?? 1;

  return {
    user,
    signOut,
    organization,
    userMemberships,
    setActive,
    mounted,
    fullName: user?.fullName ?? user?.firstName ?? "User",
    roleLabel: formatRole(membership?.role),
    planName: orgData?.planName ?? "Free",
    seatCount,
  };
}

const mobileTabs = [
  { name: "Inbox", href: "/dashboard/tickets", icon: Inbox, badge: true },
  { name: "Concierge", href: "/dashboard/agent", icon: Bot, badge: false },
  { name: "Orders", href: "/dashboard/orders", icon: Box, badge: false },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, badge: false },
];

function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function formatOpenCount(openCount: number) {
  return openCount > 9 ? "9+" : openCount;
}

function dispatchNavProgressStart() {
  window.dispatchEvent(new Event("nav-progress-start"));
}

function Logo() {
  const pathname = usePathname();

  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-1.5"
      onClick={() => {
        if (pathname !== "/dashboard") dispatchNavProgressStart();
      }}
    >
      <span className="text-xl font-black text-white tracking-tight">clerk</span>
      <span className="w-2 h-2 rounded-full bg-green-400 self-start mt-1.5 shrink-0" />
    </Link>
  );
}

function OpenCountBadge({
  openCount,
  className,
  animate = false,
}: {
  openCount: number;
  className: string;
  animate?: boolean;
}) {
  if (openCount <= 0) return null;

  return (
    <span key={animate ? openCount : "open-count"} className={className}>
      {formatOpenCount(openCount)}
    </span>
  );
}

function OrgSwitcher({
  navAuth,
  onSwitching,
  onClose,
  variant,
}: {
  navAuth: NavAuth;
  onSwitching: (v: boolean) => void;
  onClose?: () => void;
  variant: "desktop" | "mobile" | "mobileCompact";
}) {
  const { organization, userMemberships, setActive, mounted, planName, seatCount } = navAuth;
  const isMobile = variant === "mobile";
  const isCompact = variant === "desktop" || variant === "mobileCompact";
  const memberships = userMemberships.data as WorkspaceMembership[] | undefined;

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === organization?.id || !setActive) return;

    onClose?.();
    onSwitching(true);

    try {
      await setActive({ organization: organizationId });
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch workspace", error);
      onSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center outline-none text-left transition-colors hover:bg-white/[0.06]",
            isMobile ? "gap-2.5 px-3 py-2.5 mb-4 rounded-lg" : "gap-2 px-1 py-1 rounded-lg hover:bg-white/[0.04]",
          )}
        >
          <OrgAvatar
            name={organization?.name}
            imageUrl={organization?.imageUrl}
            className={cn(
              "rounded-md bg-green-500/20 text-[13px] font-bold text-green-300 shrink-0",
              isCompact ? "w-6 h-6" : "w-9 h-9",
            )}
          />
          <div className="flex-1 min-w-0">
            <p className={cn("font-bold text-white truncate leading-tight", isCompact ? "text-xs" : "text-sm")}>
              {organization?.name ?? "Workspace"}
            </p>
            <p className="text-[11px] font-medium text-white/40 truncate leading-tight mt-0.5">
              {planName} plan · {seatCount} seat{seatCount === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronDown className={cn("text-white/30 shrink-0", isCompact ? "w-3.5 h-3.5" : "w-4 h-4")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-white/[0.09] text-white"
      >
        {mounted &&
          memberships?.map((mem) => {
            const isActive = mem.organization.id === organization?.id;

            return (
              <DropdownMenuItem
                key={mem.organization.id}
                onClick={() => switchOrganization(mem.organization.id)}
                className={cn(
                  "flex items-center gap-2.5 cursor-pointer focus:bg-white/[0.07]",
                  isActive && "bg-white/[0.04]",
                )}
              >
                <OrgAvatar
                  name={mem.organization.name}
                  imageUrl={mem.organization.imageUrl}
                  className="w-5 h-5 rounded bg-white/10 text-[10px] text-white/70 shrink-0"
                />
                <span className="flex-1 text-xs font-medium text-white/80 truncate">{mem.organization.name}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        <DropdownMenuSeparator className="bg-white/[0.08]" />
        <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/[0.07]">
          <Link
            href="/create-org"
            className="flex items-center gap-2.5"
            onClick={() => {
              onClose?.();
              dispatchNavProgressStart();
            }}
          >
            <div className="w-5 h-5 rounded bg-white/[0.06] flex items-center justify-center text-white/30 text-sm font-light leading-none shrink-0">
              +
            </div>
            <span className="text-xs font-medium text-white/40">Create workspace</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ navAuth, variant }: { navAuth: NavAuth; variant: "desktop" | "mobile" }) {
  const { user, signOut, fullName, roleLabel } = navAuth;
  const isMobile = variant === "mobile";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2.5 rounded-lg hover:bg-white/[0.08] transition-colors text-left outline-none min-w-0 flex-1",
            isMobile ? "px-3 py-2.5" : "px-2 py-1.5 hover:bg-white/[0.06]",
          )}
        >
          <OrgAvatar
            name={fullName}
            imageUrl={user?.imageUrl}
            className={cn(
              "rounded-full bg-white/20 text-white font-bold ring-1 ring-white/20 shrink-0",
              isMobile ? "w-8 h-8 text-[11px]" : "w-7 h-7 text-[10px]",
            )}
          />
          <div className="flex-1 min-w-0">
            <p className={cn("font-semibold text-white truncate leading-tight", isMobile ? "text-sm" : "text-xs")}>
              {fullName}
            </p>
            <p className={cn("font-medium text-white/40 truncate leading-tight mt-0.5", isMobile ? "text-[11px]" : "text-[10px]")}>
              {roleLabel}
            </p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-48 bg-popover border-white/[0.09] text-white">
        <DropdownMenuItem
          onClick={() => signOut({ redirectUrl: "/login" })}
          className="text-red-400 focus:text-red-400 focus:bg-white/[0.07] cursor-pointer gap-2"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavGroupList({
  pathname,
  openCount,
  onNavigate,
  variant,
}: {
  pathname: string;
  openCount: number;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
  variant: "desktop" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <>
        {navGroups.map((group, i) => (
          <div key={group.label || "home"} className={i > 0 ? "mt-4" : ""}>
            {group.label && (
              <p className="text-[0.65rem] font-bold tracking-widest uppercase text-white/30 px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = isRouteActive(pathname, item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={(e) => onNavigate(e, isActive)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                      isActive ? "bg-white/[0.12] text-white font-medium" : "text-gray-400 hover:text-white hover:bg-white/[0.06]",
                    )}
                  >
                    <item.icon className="w-[16px] h-[18px] shrink-0" />
                    <span className="text-sm">{item.name}</span>
                    {item.badge && (
                      <OpenCountBadge
                        openCount={openCount}
                        className="ml-auto min-w-[20px] h-5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {navGroups.map((group, i) => (
        <div key={group.label || "home"} className={i > 0 ? "mt-3" : ""}>
          {group.label && (
            <div className="flex items-center px-3 mb-1 gap-1">
              <p className="text-[0.7rem] font-bold tracking-wide uppercase text-white/[0.35] whitespace-nowrap">
                {group.label}
              </p>
            </div>
          )}
          <SidebarMenu>
            {group.items.map((item) => {
              const isActive = isRouteActive(pathname, item.href);

              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className="rounded-md h-auto py-1 px-3 text-sm font-light leading-snug text-white/60 hover:text-white hover:bg-white/[0.05] data-[active=true]:bg-white/[0.06] data-[active=true]:text-white data-[active=true]:font-medium"
                  >
                    <Link href={item.href} onClick={(e) => onNavigate(e, isActive)}>
                      <item.icon className="w-[10px] h-[10px] shrink-0 stroke-1 mr-1" />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && openCount > 0 && (
                    <SidebarMenuBadge className="pointer-events-none">
                      <OpenCountBadge
                        openCount={openCount}
                        animate
                        className="min-w-[20px] h-5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums animate-in zoom-in-75 duration-150"
                      />
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      ))}
    </>
  );
}

function FooterLinks({
  pathname,
  onNavigate,
  variant,
}: {
  pathname: string;
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => void;
  variant: "desktop" | "mobile";
}) {
  const isMobile = variant === "mobile";

  return (
    <>
      {footerNavItems.map((item) => {
        const isActive = isRouteActive(pathname, item.href);

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={(e) => onNavigate(e, isActive)}
            title={item.name}
            aria-label={item.name}
            className={cn(
              "rounded-md transition-colors shrink-0",
              isMobile ? "p-2.5 rounded-lg" : "p-1.5",
              isActive
                ? isMobile
                  ? "text-white bg-white/[0.15]"
                  : "text-white bg-white/[0.08]"
                : "text-white/30 hover:text-white/70 hover:bg-white/[0.05]",
            )}
          >
            <item.icon className={isMobile ? "w-[18px] h-[18px]" : "w-[15px] h-[15px]"} />
          </Link>
        );
      })}
    </>
  );
}

function SidebarNavContent({
  openCount,
  onSwitching,
  navAuth,
}: {
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const { open: openCmd } = useCommandPalette();

  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const handleScroll = useCallback(() => {
    setIsScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setIsScrolling(false), 800);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    if (isMobile) setOpenMobile(false);
    dispatchNavProgressStart();
  };

  return (
    <>
      <SidebarContent
        className={cn(
          "px-2 pt-1 pb-2 gap-0 overflow-x-hidden bg-black custom-scrollbar",
          isScrolling && "is-scrolling",
        )}
        onScroll={handleScroll}
      >
        <div className="pb-1 mb-2 border-b border-white/[0.06]">
          <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} variant="desktop" />
        </div>

        <button
          type="button"
          onClick={openCmd}
          className="w-full mb-2.5 flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/[0.1] hover:bg-white/[0.2] transition-colors outline-none text-left"
        >
          <Search className="w-3.5 h-3.5 text-white/35 shrink-0" />
          <span className="flex-1 text-xs text-white/40">Search or jump to…</span>
          <kbd className="text-[10px] font-semibold bg-white/[0.08] px-1 py-0.5 rounded text-white/40 shrink-0 leading-none">⌘K</kbd>
        </button>

        <NavGroupList pathname={pathname} openCount={openCount} onNavigate={handleNavClick} variant="desktop" />
      </SidebarContent>

      <SidebarFooter className="border-t bg-black border-sidebar-border px-2 py-2 gap-0">
        <div className="flex items-center gap-1">
          <UserMenu navAuth={navAuth} variant="desktop" />
          <FooterLinks pathname={pathname} onNavigate={handleNavClick} variant="desktop" />
        </div>
      </SidebarFooter>
    </>
  );
}

function MobileNavSheet({
  open,
  onClose,
  openCount,
  onSwitching,
  navAuth,
}: {
  open: boolean;
  onClose: () => void;
  openCount: number;
  onSwitching: (v: boolean) => void;
  navAuth: NavAuth;
}) {
  const pathname = usePathname();

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    onClose();
    dispatchNavProgressStart();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="top"
        showCloseButton={false}
        className="bg-black border-b border-white/[0.08] p-0 max-h-[85dvh] overflow-y-auto"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.08] shrink-0">
          <div className="flex-1 min-w-0">
            <OrgSwitcher navAuth={navAuth} onSwitching={onSwitching} onClose={onClose} variant="mobileCompact" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 py-3">
          <NavGroupList pathname={pathname} openCount={openCount} onNavigate={handleNavClick} variant="mobile" />
        </div>

        <div className="border-t border-white/[0.08] px-3 py-3">
          <div className="flex items-center gap-1">
            <UserMenu navAuth={navAuth} variant="mobile" />
            <FooterLinks pathname={pathname} onNavigate={handleNavClick} variant="mobile" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileBottomBar({ openCount }: { openCount: number }) {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-black border-t border-white/[0.08] flex items-stretch">
      {mobileTabs.map((tab) => {
        const isActive = isRouteActive(pathname, tab.href);

        return (
          <Link
            key={tab.name}
            href={tab.href}
            onClick={(e) => {
              if (isActive) {
                e.preventDefault();
                return;
              }
              dispatchNavProgressStart();
            }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors",
              isActive ? "text-white" : "text-white/70",
            )}
          >
            {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-sky-400" />}
            <div className="relative">
              <tab.icon className="w-5 h-5" />
              {tab.badge && (
                <OpenCountBadge
                  openCount={openCount}
                  className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums leading-none"
                />
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{tab.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardSidebar({ children }: { children: React.ReactNode }) {
  const { count: openCount } = useOpenThreadCountQuery();
  const navAuth = useNavAuth();
  const { isOpen: isAgentOpen, toggle: toggleAgent } = useAgentPanel();
  const [isSwitching, setIsSwitching] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <OpenThreadCountContext.Provider value={openCount}>
      {isSwitching && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-3 text-white/60">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
            <span className="text-sm font-medium">Switching workspace…</span>
          </div>
        </div>
      )}

      <SidebarProvider className="flex-1 min-h-0 w-full overflow-x-hidden">
        <Sidebar className="max-md:hidden border-r-0 bg-background" collapsible="offcanvas">
          <SidebarNavContent openCount={openCount} onSwitching={setIsSwitching} navAuth={navAuth} />
        </Sidebar>

        <SidebarInset className="flex-1 min-h-0 overflow-hidden bg-black flex flex-col">
          <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar">
            <Logo />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="p-2 rounded-md text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:pb-0 pb-16">{children}</div>
        </SidebarInset>
      </SidebarProvider>

      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        openCount={openCount}
        onSwitching={setIsSwitching}
        navAuth={navAuth}
      />

      <MobileBottomBar openCount={openCount} />
    </OpenThreadCountContext.Provider>
  );
}
