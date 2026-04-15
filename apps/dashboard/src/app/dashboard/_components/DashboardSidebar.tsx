"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Bot, LogOut, ChevronsUpDown, ChevronDown, ChevronUpCircle } from "lucide-react";
import { useOpenThreads } from "@/hooks/useThreads";
import { useUser, useClerk, useOrganization, useOrganizationList } from "@clerk/nextjs";

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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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

function SidebarNavContent({
  openCount,
  onSwitching,
}: {
  openCount: number;
  onSwitching: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });

  const fullName = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const handleNavClick = (e: React.MouseEvent, isActive: boolean) => {
    if (isActive) {
      e.preventDefault();
      return;
    }
    if (isMobile) setOpenMobile(false);
    window.dispatchEvent(new Event("nav-progress-start"));
  };

  return (
    <>
      <SidebarContent className="px-1 py-2 gap-0 overflow-x-hidden bg-black">
        {/* Org switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center border-1 border-solid border-white/10 gap-1 px-2 py-2 mb-3 rounded-lg hover:bg-white/[0.1] transition-colors outline-none text-left">
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
            className="w-[--radix-popper-anchor-width] bg-popover border-white/[0.09] text-white"
          >
            {userMemberships.data?.map(
              (mem: { organization: { id: string; name: string; imageUrl?: string } }) => (
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
              )
            )}
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
          <div key={group.label || "home"} className={i > 0 ? "mt-4" : ""}>
            {group.label && (
              <div className="flex items-center px-3 mt-1 mb-[0.5] gap-1">
                <p className="text-[0.7rem] font-bold tracking-widest letter-spacing:0.05em uppercase text-white/20 whitespace-nowrap">
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
          </div>
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t bg-black border-sidebar-border px-3 py-2 gap-0">
        {footerNavItems.length > 0 && (
          <SidebarMenu className="gap-0.5 mb-2">
            {footerNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className="rounded-lg h-auto py-1.5 px-3 text-sm font-normal text-gray-500 hover:text-white/80 hover:bg-white/[0.05] data-[active=true]:bg-white/[0.15] data-[active=true]:text-white data-[active=true]:font-medium"
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
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              suppressHydrationWarning
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.08] transition-colors text-left outline-none"
            >
              <OrgAvatar
                name={fullName}
                imageUrl={user?.imageUrl}
                className="w-7 h-7 rounded-full bg-white/20 text-white font-bold text-[10px] ring-1 ring-white/20 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/90 truncate leading-tight">{fullName}</p>
                <p className="text-[10px] text-white/40 leading-tight">{email}</p>
              </div>
              <ChevronUpCircle className="w-3.5 h-3.5 text-white/25 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-[--radix-popper-anchor-width] min-w-max bg-popover border-white/[0.09] text-white"
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
  const [isSwitching, setIsSwitching] = useState(false);

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
        <Sidebar className="border-r-0 bg-background" collapsible="offcanvas">
          <SidebarHeader className="h-12 flex-row items-center px-5 border-b border-sidebar-border bg-black shrink-0">
            <Logo />
          </SidebarHeader>
          <SidebarNavContent openCount={openCount} onSwitching={setIsSwitching} />
        </Sidebar>

        {/* Main content */}
        <SidebarInset className="flex-1 min-h-0 overflow-hidden bg-black flex flex-col">
          {/* Mobile-only top bar */}
          <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-sidebar">
            <Logo />
            <div className="flex items-center gap-1">
              <button
                onClick={toggleAgent}
                className={`p-2 rounded-md transition-colors ${
                  isAgentOpen
                    ? "text-green-400 bg-green-400/15"
                    : "text-green-400/70 hover:text-green-400 hover:bg-green-400/10"
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
