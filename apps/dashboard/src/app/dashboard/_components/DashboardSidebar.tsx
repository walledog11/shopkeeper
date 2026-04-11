"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { Bot, LogOut, ChevronsUpDown } from "lucide-react";
import { useOpenThreads } from "@/hooks/useThreads";
import { useUser, useClerk } from "@clerk/nextjs";

import { navItems, footerNavItems } from "./nav-items";
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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgAvatar } from "@/components/OrgAvatar";

const OpenThreadCountContext = createContext(0);
export const useOpenThreadCount = () => useContext(OpenThreadCountContext);

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-1.5">
      <span className="text-xl font-black text-white tracking-tight">clerk</span>
      <span className="w-2 h-2 rounded-full bg-green-400 self-start mt-1.5 shrink-0" />
    </Link>
  );
}

function SidebarNavContent({ openCount }: { openCount: number }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const { user } = useUser();
  const { signOut } = useClerk();

  const fullName = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const handleNavClick = (e: React.MouseEvent, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    if (isMobile) setOpenMobile(false);
    window.dispatchEvent(new Event('nav-progress-start'));
  };

  return (
    <>
      {/* Main nav */}
      <SidebarContent className="px-3 py-3 gap-0">
        <SidebarMenu className="gap-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <SidebarMenuItem key={item.name} className="relative">
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] bg-green-400 rounded-r-full z-10 pointer-events-none animate-in fade-in-0 duration-150" />
                )}
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className="rounded-xl h-auto py-2.5 px-3 text-sm font-medium text-white/45 hover:text-white/80 hover:bg-white/[0.05] data-[active=true]:bg-white/[0.07] data-[active=true]:text-white"
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
                      className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center bg-green-400 text-black tabular-nums animate-in zoom-in-75 duration-150"
                    >
                      {openCount > 9 ? "9+" : openCount}
                    </span>
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer: Settings + User */}
      <SidebarFooter className="border-t border-sidebar-border px-3 py-3 gap-0">
        <SidebarMenu className="gap-0.5">
          {footerNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <SidebarMenuItem key={item.name} className="relative">
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] bg-yellow-400 rounded-r-full z-10 pointer-events-none animate-in fade-in-0 duration-150" />
                )}
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className="rounded-xl h-auto py-2.5 px-3 text-sm font-medium text-white/45 hover:text-white/80 hover:bg-white/[0.05] data-[active=true]:bg-white/[0.07] data-[active=true]:text-white"
                >
                  <Link href={item.href} onClick={(e) => handleNavClick(e, isActive)}>
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        <SidebarSeparator className="my-2 bg-sidebar-border" />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.08] transition-colors text-left outline-none">
              <OrgAvatar
                name={fullName}
                imageUrl={user?.imageUrl}
                className="w-7 h-7 rounded-full bg-white/20 text-white font-bold text-[10px] ring-1 ring-white/20 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/90 truncate leading-tight">{fullName}</p>
                <p className="text-[10px] text-white/40 truncate leading-tight">{email}</p>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 text-white/25 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-[--radix-popper-anchor-width] bg-popover border-white/[0.09] text-white"
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
      </SidebarFooter>
    </>
  );
}

export default function DashboardSidebar({ children }: { children: React.ReactNode }) {
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
  const { isOpen: isAgentOpen, toggle: toggleAgent } = useAgentPanel();

  return (
    <OpenThreadCountContext.Provider value={openCount}>
    <SidebarProvider className="flex-1 min-h-0">
      <Sidebar className="border-r-0 bg-sidebar" collapsible="offcanvas">
        <SidebarHeader className="h-16 flex-row items-center px-5 border-b border-sidebar-border shrink-0">
          <Logo />
        </SidebarHeader>

        <SidebarNavContent openCount={openCount} />
      </Sidebar>

      {/* Main content */}
      <SidebarInset className="flex-1 min-h-0 overflow-hidden bg-background flex flex-col">
        {/* Mobile-only top bar */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar">
          <Logo />
          <div className="flex items-center gap-1">
            <button
              onClick={toggleAgent}
              className={`p-2 rounded-md transition-colors ${
                isAgentOpen
                  ? 'text-amber-400 bg-amber-400/15'
                  : 'text-amber-400/70 hover:text-amber-400 hover:bg-amber-400/10'
              }`}
              title="AI Agent"
            >
              <Bot className="w-5 h-5" />
            </button>
            <SidebarTrigger className="text-white/60 hover:text-white hover:bg-white/[0.08]" />
          </div>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
    </OpenThreadCountContext.Provider>
  );
}

