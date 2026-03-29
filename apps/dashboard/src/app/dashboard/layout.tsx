"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Settings, LogOut, Bell, Menu, X, ChevronDown, HelpCircle, BarChart2, Users } from "lucide-react";
import HelpPanel from "./_components/help/HelpPanel";
import { HelpProvider, useHelp } from "./_components/help/HelpContext";
import NotificationBar, { type Notification } from "@/components/NotificationBar";
import { useOpenThreads } from "@/hooks/useThreads";
import { useUser, useClerk, useOrganization, useOrganizationList } from "@clerk/nextjs";
import { OrgAvatar } from "@/components/OrgAvatar";

const NOTIFICATIONS: Notification[] = [
  {
    id: "add-integration",
    type: "info",
    title: "Connect your first channel",
    message: "Start receiving support tickets from email, Instagram, SMS, and more.",
    action: { label: "Add an integration", href: "/dashboard/integrations" },
  },
  {
    id: "billing",
    type: "warning",
    title: "Your free trial ends in 7 days.",
    message: "Upgrade to keep your team running smoothly.",
    action: { label: "Upgrade now", href: "/dashboard/settings?tab=billing" },
  },
  {
    id: "sms",
    type: "success",
    title: "SMS support is now available!",
    message: "Reach customers directly on their phones.",
    action: { label: "Enable it", href: "/dashboard/settings" },
  },
];

function Tooltip({ label, desktopOnly = true }: { label: React.ReactNode; desktopOnly?: boolean }) {
  return (
    <div className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 ${desktopOnly ? 'hidden md:flex' : 'flex'} items-center whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-150 translate-x-1 group-hover:translate-x-0 z-50`}>
      <div className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-lg">{label}</div>
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45 rounded-sm" />
    </div>
  );
}

const navItems = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Support Tickets", href: "/dashboard/tickets", icon: Inbox, badge: true },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { name: "Team", href: "/dashboard/team", icon: Users },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <HelpProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </HelpProvider>
  )
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const { isOpen: isHelpOpen, openHelp, closeHelp } = useHelp();
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });

  const closeMenu = () => setIsMobileMenuOpen(false);

  const fullName = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col h-screen bg-white font-sans overflow-hidden">
      {/* Notification bar — full width, above everything */}
      <NotificationBar notifications={NOTIFICATIONS} />

      {/* Mobile top bar — in normal flow, so it sits below the notification bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'linear-gradient(135deg, #1e3f3b 0%, #132b28 100%)' }}>
          <Link href="/dashboard" className="flex items-center gap-1">
            <span className="text-2xl font-black text-white tracking-tight">clerk</span>
            <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1 shrink-0" />
          </Link>
          <div className="flex items-center gap-1 ml-auto mr-1">
            <button
              onClick={() => isHelpOpen ? closeHelp() : openHelp()}
              aria-label="Help"
              className={`p-2 rounded-md transition-colors ${isHelpOpen ? "text-white bg-white/15" : "text-white/60 hover:text-white"}`}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <div className="relative group">
              <button aria-label="Notifications" className="p-2 text-white/60 hover:text-white rounded-md transition-colors">
                <Bell className="w-5 h-5" />
              </button>
              <div className="pointer-events-none group-hover:pointer-events-auto absolute right-0 top-full mt-2 w-72 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-150 z-50">
                <div className="bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
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
          <button onClick={() => setIsMobileMenuOpen(true)} aria-label="Open navigation" className="p-2 -mr-2 text-white/70 hover:text-white rounded-md">
            <Menu className="w-6 h-6" />
          </button>
        </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Mobile overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMenu} />
        )}

        {/* Sidebar — fixed icon-only on desktop, slide-in drawer on mobile */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-64 flex flex-col shrink-0
            md:relative md:translate-x-0 md:h-full md:w-[72px]
            ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
          `}
          style={{ background: 'linear-gradient(180deg, #1e3f3b 0%, #132b28 100%)' }}
        >
          {/* Brand */}
          <div className="h-16 flex items-center shrink-0 px-4 md:justify-center md:px-0">
            <Link href="/dashboard" className="flex items-center gap-1 md:hidden" onClick={closeMenu}>
              <span className="text-2xl font-black text-white tracking-tight">clerk</span>
              <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1 shrink-0" />
            </Link>
            <Link href="/dashboard" className="hidden md:flex items-center gap-1">
              <span className="text-3xl font-black text-white tracking-tight">c</span>
              <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1 shrink-0" />
            </Link>
            <button className="md:hidden p-1 text-white/50 hover:text-white ml-auto" onClick={closeMenu} aria-label="Close navigation">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 flex flex-col items-start py-3 gap-1 px-3 md:items-center md:px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <div key={item.name} className="relative group w-full md:w-auto">
                  <Tooltip label={item.name} />
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    className={`relative flex items-center gap-3 py-2.5 px-3 rounded-md text-sm font-medium transition-all
                      md:gap-0 md:justify-center md:px-0 md:w-11 md:h-11
                      ${isActive ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10 hover:text-white"}
                    `}
                  >
                    <item.icon className="w-6 h-6 shrink-0" />
                    <span className="md:hidden">{item.name}</span>
                    {item.badge && openCount > 0 && (
                      <>
                        <span className="absolute -top-1 -right-1 hidden md:flex min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold items-center justify-center bg-yellow-400 text-slate-900">
                          {openCount > 9 ? "9+" : openCount}
                        </span>
                        <span className="md:hidden ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-400 text-slate-900">
                          {openCount}
                        </span>
                      </>
                    )}
                  </Link>
                </div>
              );
            })}
          </nav>

          {/* Bottom controls */}
          <div className="shrink-0 flex flex-col gap-1 pb-4 border-t border-white/10 pt-3 px-3 md:items-center md:px-2">
            {/* Settings */}
            <div className="relative group w-full md:w-auto">
              <Tooltip label="Settings" />
              <Link
                href="/dashboard/settings"
                onClick={closeMenu}
                className="flex items-center gap-3 py-2.5 px-3 rounded-md text-white/50 hover:bg-white/10 hover:text-white transition-all text-sm font-medium w-full md:gap-0 md:justify-center md:px-0 md:w-11 md:h-11"
              >
                <Settings className="w-6 h-6 shrink-0" />
                <span className="md:hidden">Settings</span>
              </Link>
            </div>

            {/* Sign out */}
            <div className="relative group w-full md:w-auto">
              <Tooltip label="Sign out" />
              <button
                onClick={() => signOut({ redirectUrl: "/login" })}
                className="flex items-center gap-3 py-2.5 px-3 rounded-md text-white/50 hover:bg-white/10 hover:text-red-400 transition-all text-sm font-medium text-left w-full md:gap-0 md:justify-center md:px-0 md:w-11 md:h-11"
              >
                <LogOut className="w-6 h-6 shrink-0" />
                <span className="md:hidden text-red-300">Log out</span>
              </button>
            </div>

            {/* User avatar */}
            <div className="mt-1 pt-2 border-t border-white/10 md:self-stretch">
              {/* Desktop: avatar with tooltip */}
              <div className="relative group hidden md:flex md:justify-center">
                <Tooltip desktopOnly={false} label={<><p>{fullName}</p><p className="font-normal text-white/50 text-[10px]">{email}</p></>} />
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs overflow-hidden ring-2 ring-white/10">
                  {user?.imageUrl ? <img src={user.imageUrl} alt={fullName} className="w-full h-full object-cover" /> : initials}
                </div>
              </div>
              {/* Mobile: avatar + name + email */}
              <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors md:hidden">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs overflow-hidden shrink-0 ring-2 ring-white/10">
                  {user?.imageUrl ? <img src={user.imageUrl} alt={fullName} className="w-full h-full object-cover" /> : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 truncate leading-tight">{fullName}</p>
                  <p className="text-[10px] text-white/40 truncate leading-tight">{email}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">

          {/* Top header bar — desktop only */}
          <div className="hidden md:flex items-center justify-between border-b border-slate-100 px-4 h-[52px] shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {navItems.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))?.name ?? (pathname.includes("settings") ? "Settings" : "Dashboard")}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => isHelpOpen ? closeHelp() : openHelp()}
                className={`p-2 rounded-md transition-colors ${isHelpOpen ? "text-slate-700 bg-slate-100" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}
                title="Help"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <div className="relative group">
                <button aria-label="Notifications" title="Notifications" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors">
                  <Bell className="w-5 h-5" />
                </button>
                <div className="pointer-events-none group-hover:pointer-events-auto absolute right-0 top-full mt-2 w-72 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-150 z-50">
                  <div className="bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
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
              <div className="w-px h-5 bg-slate-200 mx-1" />
              {/* Org switcher */}
              <div className="relative">
                <button
                  onClick={() => setOrgDropdownOpen(o => !o)}
                  className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <OrgAvatar name={organization?.name} imageUrl={organization?.imageUrl} className="w-6 h-6 rounded bg-slate-200 text-[10px] text-slate-600" />
                  <span className="text-xs font-semibold text-slate-700 max-w-[140px] truncate">{organization?.name ?? 'Workspace'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${orgDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {orgDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOrgDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-md shadow-2xl overflow-hidden z-50">
                      {userMemberships.data?.map((mem: { organization: { id: string; name: string; imageUrl?: string } }) => (
                        <button
                          key={mem.organization.id}
                          onClick={() => { setActive?.({ organization: mem.organization.id }); setOrgDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${mem.organization.id === organization?.id ? 'bg-slate-50' : ''}`}
                        >
                          <OrgAvatar name={mem.organization.name} imageUrl={mem.organization.imageUrl} className="w-5 h-5 rounded bg-slate-200 text-[10px] text-slate-600" />
                          <span className="flex-1 text-xs font-medium text-slate-700 truncate">{mem.organization.name}</span>
                          {mem.organization.id === organization?.id && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                        </button>
                      ))}
                      <div className="border-t border-slate-100">
                        <Link href="/create-org" onClick={() => setOrgDropdownOpen(false)} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors">
                          <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-base font-light leading-none shrink-0">+</div>
                          <span className="text-xs font-medium text-slate-500">Create workspace</span>
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Page content + help panel */}
          <div className="flex-1 overflow-hidden flex min-h-0">
            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
              {children}
            </div>
            <HelpPanel />
          </div>
        </main>

      </div>
    </div>
  );
}
