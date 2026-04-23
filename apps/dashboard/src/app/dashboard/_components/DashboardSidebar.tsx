"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Bot, Box, ChevronDown, ChevronUp, Inbox, LogOut, Menu, Settings, X } from "lucide-react";
import { useOpenThreads } from "@/hooks/useThreads";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";

import { navGroups, footerNavItems } from "./nav-items";
import { useAgentPanel } from "./agent-panel/AgentPanelContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
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

// ─── Shared auth hook (deduplicates Clerk state across desktop + mobile nav) ──

function useNavAuth() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return {
    user,
    signOut,
    organization,
    userMemberships,
    setActive,
    mounted,
    fullName: user?.fullName ?? user?.firstName ?? "User",
  };
}

// ─── Bottom tab definitions (explicit imports — not fragile index lookups) ────

const mobileTabs = [
  { name: "Inbox",     href: "/dashboard/tickets",  icon: Inbox,    badge: true  },
  { name: "Concierge", href: "/dashboard/agent",    icon: Bot,      badge: false },
  { name: "Orders",    href: "/dashboard/orders",   icon: Box,      badge: false },
  { name: "Settings",  href: "/dashboard/settings", icon: Settings, badge: false },
];

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  const pathname = usePathname();
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-1.5"
      onClick={() => {
        if (pathname !== "/dashboard") {
          window.dispatchEvent(new Event("nav-progress-start"));
        }
      }}
    >
      <span className="text-xl font-black text-white tracking-tight">clerk</span>
      <span className="w-2 h-2 rounded-full bg-green-400 self-start mt-1.5 shrink-0" />
    </Link>
  );
}

// ─── Desktop sidebar nav (uses sidebar primitives) ───────────────────────────

function SidebarNavContent({
  openCount,
  onSwitching,
}: {
  openCount: number;
  onSwitching: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const { user, signOut, organization, userMemberships, setActive, mounted, fullName } = useNavAuth();

  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const handleScroll = useCallback(() => {
    setIsScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setIsScrolling(false), 800);
  }, []);

  const handleNavClick = (e: React.MouseEvent, isActive: boolean) => {
    if (isActive) { e.preventDefault(); return; }
    if (isMobile) setOpenMobile(false);
    window.dispatchEvent(new Event("nav-progress-start"));
  };

  return (
    <>
      <SidebarContent
        className={`px-1 py-2 gap-0 overflow-x-hidden bg-black custom-scrollbar${isScrolling ? " is-scrolling" : ""}`}
        onScroll={handleScroll}
      >
        {/* Org switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full relative flex items-center border-1 border-solid border-white/10 gap-1 px-2 py-2 mb-3 rounded-lg hover:bg-white/[0.1] transition-colors outline-none text-left">
              <OrgAvatar
                name={organization?.name}
                imageUrl={organization?.imageUrl}
                className="w-6 h-6 rounded bg-white/10 text-[10px] text-white/70 shrink-0"
              />
              <span className="flex-1 text-xs font-semibold text-white/70 truncate">
                {organization?.name ?? "Workspace"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-white/[0.09] text-white"
          >
            {mounted && userMemberships.data?.map((mem: { organization: { id: string; name: string; imageUrl?: string } }) => (
              <DropdownMenuItem
                key={mem.organization.id}
                onClick={async () => {
                  if (mem.organization.id === organization?.id) return;
                  onSwitching(true);
                  await setActive?.({ organization: mem.organization.id });
                  window.location.reload();
                }}
                className={`flex items-center gap-2.5 cursor-pointer focus:bg-white/[0.07] ${
                  mem.organization.id === organization?.id ? "bg-white/[0.04]" : ""
                }`}
              >
                <OrgAvatar
                  name={mem.organization.name}
                  imageUrl={mem.organization.imageUrl}
                  className="w-5 h-5 rounded bg-white/10 text-[10px] text-white/70 shrink-0"
                />
                <span className="flex-1 text-xs font-medium text-white/80 truncate">
                  {mem.organization.name}
                </span>
                {mem.organization.id === organization?.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/[0.07]">
              <Link href="/create-org" className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded bg-white/[0.06] flex items-center justify-center text-white/30 text-sm font-light leading-none shrink-0">
                  +
                </div>
                <span className="text-xs font-medium text-white/40">Create workspace</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Nav groups */}
        {navGroups.map((group, i) => (
          <div key={group.label || "home"} className={i > 0 ? "mt-3" : ""}>
            {group.label && (
              <div className="flex items-center px-3 mb-0.5 gap-1">
                <p className="text-[0.7rem] font-bold tracking-widest uppercase text-white/[0.30] whitespace-nowrap">
                  {group.label}
                </p>
              </div>
            )}
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="rounded-lg h-auto py-2 px-3 text-sm font-medium leading-snug text-gray-400 hover:text-white hover:bg-white/[0.05] data-[active=true]:bg-white/[0.15] data-[active=true]:text-white data-[active=true]:font-medium"
                    >
                      <Link href={item.href} onClick={(e) => handleNavClick(e, isActive)}>
                        <item.icon className="w-[18px] h-[18px] shrink-0" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge && openCount > 0 && (
                      <SidebarMenuBadge className="pointer-events-none">
                        <span
                          key={openCount}
                          className="min-w-[20px] h-5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums animate-in zoom-in-75 duration-150"
                        >
                          {openCount > 9 ? "9+" : openCount}
                        </span>
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t bg-black border-sidebar-border px-2 py-2 gap-0">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                suppressHydrationWarning
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-left outline-none min-w-0 flex-1"
              >
                <OrgAvatar
                  name={fullName}
                  imageUrl={user?.imageUrl}
                  className="w-6 h-6 rounded-full bg-white/20 text-white font-bold text-[10px] ring-1 ring-white/20 shrink-0"
                />
                <p className="text-xs font-semibold text-white/70 truncate leading-tight flex-1 min-w-0">{fullName}</p>
                <ChevronUp className="w-3 h-3 text-white/25 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-48 bg-popover border-white/[0.09] text-white"
            >
              <DropdownMenuItem
                onClick={() => signOut({ redirectUrl: "/login" })}
                className="text-red-400 focus:text-red-400 focus:bg-white/[0.07] cursor-pointer gap-2"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {footerNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={(e) => handleNavClick(e, isActive)}
                title={item.name}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isActive
                    ? "text-white bg-white/[0.15]"
                    : "text-white/30 hover:text-white/70 hover:bg-white/[0.05]"
                }`}
              >
                <item.icon className="w-[16px] h-[16px]" />
              </Link>
            );
          })}
        </div>
      </SidebarFooter>
    </>
  );
}

// ─── Mobile top-sheet nav ─────────────────────────────────────────────────────

function MobileNavSheet({
  open,
  onClose,
  openCount,
  onSwitching,
}: {
  open: boolean;
  onClose: () => void;
  openCount: number;
  onSwitching: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const { user, signOut, organization, userMemberships, setActive, mounted, fullName } = useNavAuth();

  const handleNavClick = (e: React.MouseEvent, isActive: boolean) => {
    if (isActive) { e.preventDefault(); return; }
    onClose();
    window.dispatchEvent(new Event("nav-progress-start"));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="top"
        showCloseButton={false}
        className="bg-black border-b border-white/[0.08] p-0 max-h-[85dvh] overflow-y-auto"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.08] shrink-0">
          <Logo />
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 py-3">
          {/* Org switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center border border-white/10 gap-2 px-3 py-2.5 mb-4 rounded-lg hover:bg-white/[0.08] transition-colors outline-none text-left">
                <OrgAvatar
                  name={organization?.name}
                  imageUrl={organization?.imageUrl}
                  className="w-7 h-7 rounded bg-white/10 text-[11px] text-white/70 shrink-0"
                />
                <span className="flex-1 text-sm font-semibold text-white/70 truncate">
                  {organization?.name ?? "Workspace"}
                </span>
                <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-white/[0.09] text-white"
            >
              {mounted && userMemberships.data?.map((mem: { organization: { id: string; name: string; imageUrl?: string } }) => (
                <DropdownMenuItem
                  key={mem.organization.id}
                  onClick={async () => {
                    if (mem.organization.id === organization?.id) return;
                    onClose();
                    onSwitching(true);
                    await setActive?.({ organization: mem.organization.id });
                    window.location.reload();
                  }}
                  className={`flex items-center gap-2.5 cursor-pointer focus:bg-white/[0.07] ${
                    mem.organization.id === organization?.id ? "bg-white/[0.04]" : ""
                  }`}
                >
                  <OrgAvatar
                    name={mem.organization.name}
                    imageUrl={mem.organization.imageUrl}
                    className="w-5 h-5 rounded bg-white/10 text-[10px] text-white/70 shrink-0"
                  />
                  <span className="flex-1 text-xs font-medium text-white/80 truncate">
                    {mem.organization.name}
                  </span>
                  {mem.organization.id === organization?.id && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-white/[0.08]" />
              <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/[0.07]">
                <Link href="/create-org" className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded bg-white/[0.06] flex items-center justify-center text-white/30 text-sm font-light leading-none shrink-0">
                    +
                  </div>
                  <span className="text-xs font-medium text-white/40">Create workspace</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Nav groups */}
          {navGroups.map((group, i) => (
            <div key={group.label || `group-${i}`} className={i > 0 ? "mt-4" : ""}>
              <p className="text-[0.65rem] font-bold tracking-widest uppercase text-white/30 px-3 mb-1">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={(e) => handleNavClick(e, isActive)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive
                          ? "bg-white/[0.12] text-white font-medium"
                          : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="text-sm">{item.name}</span>
                      {item.badge && openCount > 0 && (
                        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums">
                          {openCount > 9 ? "9+" : openCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="border-t border-white/[0.08] px-3 py-3">
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  suppressHydrationWarning
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.08] transition-colors text-left outline-none min-w-0 flex-1"
                >
                  <OrgAvatar
                    name={fullName}
                    imageUrl={user?.imageUrl}
                    className="w-7 h-7 rounded-full bg-white/20 text-white font-bold text-[11px] ring-1 ring-white/20 shrink-0"
                  />
                  <p className="text-sm font-semibold text-white/70 truncate leading-tight flex-1 min-w-0">{fullName}</p>
                  <ChevronUp className="w-3.5 h-3.5 text-white/25 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-48 bg-popover border-white/[0.09] text-white"
              >
                <DropdownMenuItem
                  onClick={() => signOut({ redirectUrl: "/login" })}
                  className="text-red-400 focus:text-red-400 focus:bg-white/[0.07] cursor-pointer gap-2"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {footerNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, isActive)}
                  title={item.name}
                  className={`p-2.5 rounded-lg transition-colors shrink-0 ${
                    isActive
                      ? "text-white bg-white/[0.15]"
                      : "text-white/30 hover:text-white/70 hover:bg-white/[0.05]"
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                </Link>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────

function MobileBottomBar({ openCount }: { openCount: number }) {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-black border-t border-white/[0.08] flex items-stretch">
      {mobileTabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.name}
            href={tab.href}
            onClick={(e) => {
              if (isActive) { e.preventDefault(); return; }
              window.dispatchEvent(new Event("nav-progress-start"));
            }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors ${
              isActive ? "text-white" : "text-white/30"
            }`}
          >
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-green-400" />
            )}
            <div className="relative">
              <tab.icon className="w-5 h-5" />
              {tab.badge && openCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums leading-none">
                  {openCount > 9 ? "9+" : openCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{tab.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function DashboardSidebar({ children }: { children: React.ReactNode }) {
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
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
        {/* Desktop sidebar — hidden on mobile */}
        <Sidebar className="max-md:hidden border-r-0 bg-background" collapsible="offcanvas">
          <SidebarHeader className="h-12 flex-row items-center px-5 border-b border-sidebar-border bg-black shrink-0">
            <Logo />
          </SidebarHeader>
          <SidebarNavContent openCount={openCount} onSwitching={setIsSwitching} />
        </Sidebar>

        <SidebarInset className="flex-1 min-h-0 overflow-hidden bg-black flex flex-col">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar">
            <Logo />
            <div className="flex items-center gap-1">
              <button
                onClick={toggleAgent}
                aria-label="Toggle AI Agent"
                className={`p-2 rounded-md transition-colors ${
                  isAgentOpen
                    ? "text-green-400 bg-green-400/15"
                    : "text-green-400/70 hover:text-green-400 hover:bg-green-400/10"
                }`}
              >
                <Bot className="w-5 h-5" />
              </button>
              <button
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="p-2 rounded-md text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Page content — bottom-padded on mobile to clear the tab bar */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:pb-0 pb-16">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Mobile nav sheet (outside SidebarProvider so z-index stacks correctly) */}
      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        openCount={openCount}
        onSwitching={setIsSwitching}
      />

      {/* Mobile bottom tab bar */}
      <MobileBottomBar openCount={openCount} />
    </OpenThreadCountContext.Provider>
  );
}
