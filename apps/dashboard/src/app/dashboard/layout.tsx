"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Blocks, Settings, LogOut, Bell, Menu, X, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { useOpenThreads } from "@/hooks/useThreads";
import { useUser, useClerk } from "@clerk/nextjs";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

const navItems = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Support Tickets", href: "/dashboard/tickets", icon: Inbox, badge: true },
  { name: "Integrations", href: "/dashboard/integrations", icon: Blocks },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: org } = useSWR<{ name: string }>("/api/org", fetcher);

  const closeMenu = () => setIsMobileMenuOpen(false);

  const fullName = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  // Desktop sidebar width
  const sidebarW = isCollapsed ? "md:w-[60px]" : "md:w-52";

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between bg-[#1c3b38] px-4 py-3 shrink-0 z-30 fixed top-0 left-0 right-0">
        <Link href="/" className="flex items-center gap-1">
          <span className="text-2xl font-black text-white tracking-tight">clerk</span>
          <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1 shrink-0" />
        </Link>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -mr-2 text-white/70 hover:text-white rounded-lg">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMenu} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-[#1c3b38] flex flex-col shrink-0 transition-all duration-300 ease-in-out
          md:relative md:translate-x-0 md:h-screen ${sidebarW}
          ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
        `}
        style={{ overflow: "visible" }}
      >
        {/* Edge collapse toggle — desktop only */}
        <button
          onClick={() => setIsCollapsed(c => !c)}
          className="hidden md:flex absolute -right-3.5 top-[52px] z-50 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-md items-center justify-center text-slate-500 hover:text-slate-800 hover:shadow-lg transition-all"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
        {/* Brand */}
        <div className={`h-16 flex items-center shrink-0 px-4 ${isCollapsed ? "md:justify-center md:px-0" : "md:px-4"}`}>
          {/* Mobile: full brand */}
          <Link href="/" className="flex items-center gap-1 md:hidden" onClick={closeMenu}>
            <span className="text-2xl font-black text-white tracking-tight">clerk</span>
            <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1 shrink-0" />
          </Link>

          {/* Desktop collapsed: logo mark */}
          {isCollapsed && (
            <Link href="/" className="hidden md:flex items-center gap-0.5">
              <span className="text-xl font-black text-white tracking-tight">c</span>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 self-start shrink-0" />
            </Link>
          )}

          {/* Desktop expanded: full brand */}
          {!isCollapsed && (
            <Link href="/" className="hidden md:flex items-center gap-1">
              <span className="text-2xl font-black text-white tracking-tight">clerk</span>
              <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1 shrink-0" />
            </Link>
          )}

          <button className="md:hidden p-1 text-white/50 hover:text-white ml-auto" onClick={closeMenu}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className={`flex-1 flex flex-col items-start py-3 gap-1 ${isCollapsed ? "md:items-center md:px-2" : "md:px-3"} px-3`}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <div key={item.name} className={`relative group w-full ${isCollapsed ? "md:w-auto" : ""}`}>
                {/* Tooltip — only when collapsed */}
                {isCollapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden md:flex items-center whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-150 translate-x-1 group-hover:translate-x-0 z-50">
                    <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                      {item.name}
                    </div>
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45 rounded-sm" />
                  </div>
                )}

                <Link
                  href={item.href}
                  onClick={closeMenu}
                  className={`relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${isCollapsed ? "md:gap-0 md:justify-center md:px-0 md:w-10 md:h-10" : "md:px-3"}
                    px-3
                    ${isActive ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10 hover:text-white"}
                  `}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className={isCollapsed ? "md:hidden" : ""}>{item.name}</span>
                  {item.badge && openCount > 0 && isCollapsed && (
                    <span className="absolute -top-1 -right-1 hidden md:flex min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold items-center justify-center bg-yellow-400 text-slate-900">
                      {openCount > 9 ? "9+" : openCount}
                    </span>
                  )}
                  {item.badge && openCount > 0 && !isCollapsed && (
                    <span className="hidden md:flex ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-400 text-slate-900">
                      {openCount}
                    </span>
                  )}
                  {item.badge && openCount > 0 && (
                    <span className="md:hidden ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-400 text-slate-900">
                      {openCount}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className={`flex flex-col gap-1 pb-4 ${isCollapsed ? "md:items-center md:px-2" : "md:px-3"} px-3`}>
          {/* Settings */}
          <div className={`relative group w-full ${isCollapsed ? "md:w-auto" : ""}`}>
            {isCollapsed && (
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden md:flex items-center whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-150 translate-x-1 group-hover:translate-x-0 z-50">
                <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">Settings</div>
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45 rounded-sm" />
              </div>
            )}
            <Link
              href="/dashboard/settings"
              onClick={closeMenu}
              className={`flex items-center gap-3 py-2.5 rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition-all text-sm font-medium w-full
                ${isCollapsed ? "md:gap-0 md:justify-center md:px-0 md:w-10 md:h-10" : "md:px-3"} px-3`}
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span className={isCollapsed ? "md:hidden" : ""}>Settings</span>
            </Link>
          </div>

          {/* Sign out */}
          <div className={`relative group w-full ${isCollapsed ? "md:w-auto" : ""}`}>
            {isCollapsed && (
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden md:flex items-center whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-150 translate-x-1 group-hover:translate-x-0 z-50">
                <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">Sign out</div>
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45 rounded-sm" />
              </div>
            )}
            <button
              onClick={() => signOut({ redirectUrl: "/login" })}
              className={`flex items-center gap-3 py-2.5 rounded-xl text-white/50 hover:bg-white/10 hover:text-red-400 transition-all text-sm font-medium text-left w-full
                ${isCollapsed ? "md:gap-0 md:justify-center md:px-0 md:w-10 md:h-10" : "md:px-3"} px-3`}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span className={isCollapsed ? "md:hidden" : "text-red-300 md:text-current"}>Log out</span>
            </button>
          </div>

          {/* User avatar */}
          <div
            className={`mt-1 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs overflow-hidden shrink-0 ${isCollapsed ? "md:mx-auto" : ""}`}
            title={`${fullName} · ${email}`}
          >
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white pt-[52px] md:pt-0">

        {/* Top header bar — desktop only */}
        <div className="hidden md:flex items-center justify-between border-b border-slate-100 px-4 h-[52px] shrink-0 bg-white">

          {/* Left: org name */}
          <div className="flex items-center gap-2">
            {org?.name && (
              <>
                <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
                  <Building2 className="w-3 h-3 text-slate-400" />
                </div>
                <span className="text-sm font-semibold text-slate-700">{org.name}</span>
              </>
            )}
          </div>

          {/* Right: bell */}
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                <Bell className="w-5 h-5" />
              </button>
              <div className="pointer-events-none group-hover:pointer-events-auto absolute right-0 top-full mt-2 w-72 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-150 z-50">
                <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">Alerts</p>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">0</span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Bell className="w-6 h-6 text-slate-200" />
                    <p className="text-sm text-slate-400">No alerts right now</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </main>

    </div>
  );
}
