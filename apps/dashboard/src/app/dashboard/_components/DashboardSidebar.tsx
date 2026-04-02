"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LogOut, Menu, X, HelpCircle, Bell, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useHelp } from "./help/HelpContext";
import { useOpenThreads } from "@/hooks/useThreads";
import { useUser, useClerk } from "@clerk/nextjs";
import { navItems } from "./nav-items";

function dispatchNavStart(href: string, pathname: string) {
  if (href !== pathname) {
    window.dispatchEvent(new CustomEvent("nav-progress-start"));
  }
}

interface SidebarNavProps {
  pathname: string;
  openCount: number;
  user: ReturnType<typeof useUser>["user"];
  fullName: string;
  email: string;
  initials: string;
  isUserMenuOpen: boolean;
  onToggleUserMenu: () => void;
  onSignOut: () => void;
  onCloseMenu: () => void;
  showCloseButton?: boolean;
}

function SidebarNav({
  pathname,
  openCount,
  user,
  fullName,
  email,
  initials,
  isUserMenuOpen,
  onToggleUserMenu,
  onSignOut,
  onCloseMenu,
  showCloseButton,
}: SidebarNavProps) {
  const settingsActive = pathname === "/dashboard/settings";

  return (
    <>
      {/* Brand */}
      <div className="h-16 flex items-center shrink-0 px-5 border-b border-white/[0.06]">
        <Link href="/dashboard" className="flex items-center gap-1.5" onClick={onCloseMenu}>
          <span className="text-xl font-black text-white tracking-tight">clerk</span>
          <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1.5 shrink-0" />
        </Link>
        {showCloseButton && (
          <button
            className="p-1 text-white/40 hover:text-white ml-auto transition-colors"
            onClick={onCloseMenu}
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 flex flex-col py-3 gap-0.5 px-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <div key={item.name} className="relative">
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 bg-white/[0.11] rounded-xl"
                  transition={{ type: "spring", stiffness: 400, damping: 36 }}
                />
              )}
              <Link
                href={item.href}
                onClick={() => {
                  onCloseMenu();
                  dispatchNavStart(item.href, pathname);
                }}
                className={`relative flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors
                  ${isActive
                    ? "text-white"
                    : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
                  }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] bg-yellow-400 rounded-r-full" />
                )}
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                <span>{item.name}</span>
                {item.badge && openCount > 0 && (
                  <motion.span
                    key={openCount}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 520, damping: 22 }}
                    className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center bg-yellow-400 text-slate-900 tabular-nums"
                  >
                    {openCount > 9 ? "9+" : openCount}
                  </motion.span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="shrink-0 border-t border-white/[0.06] px-3 pt-3 pb-4 flex flex-col gap-0.5">
        {/* Settings */}
        <div className="relative">
          {settingsActive && (
            <motion.div
              layoutId="active-pill"
              className="absolute inset-0 bg-white/[0.11] rounded-xl"
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
            />
          )}
          <Link
            href="/dashboard/settings"
            onClick={() => {
              onCloseMenu();
              dispatchNavStart("/dashboard/settings", pathname);
            }}
            className={`relative flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors
              ${settingsActive
                ? "text-white"
                : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
              }`}
          >
            {settingsActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] bg-yellow-400 rounded-r-full" />
            )}
            <Settings className="w-[18px] h-[18px] shrink-0" />
            <span>Settings</span>
          </Link>
        </div>

        {/* User card */}
        <div className="relative mt-1 pt-2 border-t border-white/[0.06]">
          <button
            onClick={onToggleUserMenu}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.08] transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs overflow-hidden shrink-0 ring-1 ring-white/20">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/90 truncate leading-tight">{fullName}</p>
              <p className="text-[10px] text-white/40 truncate leading-tight">{email}</p>
            </div>
            <motion.div animate={{ rotate: isUserMenuOpen ? 0 : 180 }} transition={{ duration: 0.2 }}>
              <ChevronUp className="w-3.5 h-3.5 text-white/25 shrink-0" />
            </motion.div>
          </button>

          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/[0.09] shadow-2xl overflow-hidden"
                style={{ background: "#163430" }}
              >
                <button
                  onClick={onSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-400 hover:bg-white/[0.07] transition-colors"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Log out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

export default function DashboardSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { isOpen: isHelpOpen, openHelp, closeHelp } = useHelp();
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
  const { user } = useUser();
  const { signOut } = useClerk();

  const closeMenu = () => setIsMobileMenuOpen(false);

  const fullName = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sharedProps: SidebarNavProps = {
    pathname,
    openCount,
    user,
    fullName,
    email,
    initials,
    isUserMenuOpen,
    onToggleUserMenu: () => setIsUserMenuOpen((v) => !v),
    onSignOut: () => signOut({ redirectUrl: "/login" }),
    onCloseMenu: closeMenu,
  };

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: "linear-gradient(135deg, #1e3f3b 0%, #132b28 100%)" }}
      >
        <Link href="/dashboard" className="flex items-center gap-1.5">
          <span className="text-xl font-black text-white tracking-tight">clerk</span>
          <span className="w-2 h-2 rounded-full bg-yellow-400 self-start mt-1.5 shrink-0" />
        </Link>

        <div className="flex items-center gap-1 ml-auto mr-1">
          <button
            onClick={() => (isHelpOpen ? closeHelp() : openHelp())}
            aria-label="Help"
            className={`p-2 rounded-lg transition-colors ${
              isHelpOpen ? "text-white bg-white/15" : "text-white/50 hover:text-white"
            }`}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <div className="relative group">
            <button
              aria-label="Notifications"
              className="p-2 text-white/50 hover:text-white rounded-lg transition-colors"
            >
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

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open navigation"
          className="p-2 -mr-2 text-white/60 hover:text-white rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Flex row: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={closeMenu}
            />
          )}
        </AnimatePresence>

        {/* Mobile drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden"
              style={{ background: "linear-gradient(180deg, #1e3f3b 0%, #132b28 100%)" }}
            >
              <SidebarNav {...sharedProps} showCloseButton />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Desktop sidebar — always visible, 220px wide */}
        <aside
          className="hidden md:flex flex-col w-[220px] shrink-0 h-full"
          style={{ background: "linear-gradient(180deg, #1e3f3b 0%, #132b28 100%)" }}
        >
          <SidebarNav {...sharedProps} />
        </aside>

        {/* Main content */}
        {children}
      </div>
    </>
  );
}
