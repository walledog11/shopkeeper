"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Home, Inbox, Blocks, Settings, LogOut, Menu, X } from "lucide-react";
import { useOpenThreads } from "@/hooks/useOpenThreads";
import { useUser, useClerk } from "@clerk/nextjs";

const navItems = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Support Tickets", href: "/dashboard/tickets", icon: Inbox, badge: true },
  { name: "Integrations", href: "/dashboard/integrations", icon: Blocks },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
  const { user } = useUser();
  const { signOut } = useClerk();

  const closeMenu = () => setIsMobileMenuOpen(false);

  const fullName = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    // 1. CHANGED: Softer background (bg-slate-100) to contrast with the white floating sidebar
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 font-sans overflow-hidden">
      
      {/* --- Mobile Top Navigation Bar --- */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3 shrink-0 z-30 relative shadow-sm">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-slate-800" />
          </div>
          <span className="text-xl font-extrabold text-slate-900 tracking-tight">clerk</span>
        </Link>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 -mr-2 text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* --- Mobile Overlay Backdrop --- */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden transition-opacity"
          onClick={closeMenu}
        />
      )}
      
      {/* --- Sidebar --- */}
      {/* 2. CHANGED: Added md:m-4 md:rounded-[2rem] md:h-[calc(100vh-32px)] md:shadow-xl to create the floating effect */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col shrink-0 transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:m-4 md:rounded-[2rem] md:h-[calc(100vh-32px)] md:shadow-xl md:border md:border-slate-100
          ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
        `}
      >
        
        {/* Brand Header */}
        <div className="h-20 flex items-center justify-between px-8 border-b border-slate-50/50">
          <Link href="/" className="flex items-center gap-2 group" onClick={closeMenu}>
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center group-hover:border-yellow-300 group-hover:shadow-md transition-all">
              <Bot className="w-5 h-5 text-slate-800 group-hover:text-yellow-500 transition-colors" />
            </div>
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">clerk</span>
          </Link>
          
          <button
            className="md:hidden p-1 text-slate-500 hover:text-slate-800 rounded-md focus:outline-none focus:bg-slate-100"
            onClick={closeMenu}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={closeMenu}
                // 3. CHANGED: Added 'group' to the link and softened hover states
                className={`group flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-yellow-50 text-yellow-900 shadow-sm ring-1 ring-yellow-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* 4. CHANGED: Added group-hover:scale-110 and group-active:scale-95 for micro-interactions */}
                  <item.icon className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${isActive ? "text-yellow-600" : "text-slate-400"}`} />
                  {item.name}
                </div>
                {item.badge && openCount > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                    isActive ? "bg-yellow-200 text-yellow-800" : "bg-white border border-slate-200 text-slate-500"
                  }`}>
                    {openCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section (User & Settings) */}
        <div className="p-4 m-4 mt-0 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex flex-col gap-1 mb-2">
            <Link 
              href="/dashboard/settings" 
              onClick={closeMenu}
              className="group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900 transition-all"
            >
              <Settings className="w-4 h-4 text-slate-400 transition-transform duration-200 group-hover:rotate-45" />
              Settings
            </Link>
          </div>

          <button
            onClick={() => signOut({ redirectUrl: '/login' })}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-sm shadow-md overflow-hidden">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{fullName}</p>
              <p className="text-[11px] font-medium text-slate-500 truncate">{email}</p>
            </div>
            <LogOut className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </aside>

      {/* --- Main Content Area --- */}
      {/* 5. CHANGED: Adjusted padding because the sidebar now has margins */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative md:py-4 md:pr-4">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white md:rounded-[2rem] md:shadow-xl md:border md:border-slate-100">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>

    </div>
  );
}