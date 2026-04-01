"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, HelpCircle, Search } from "lucide-react";
import CommandPalette from "./CommandPalette";
import { useHelp } from "./help/HelpContext";
import { useOpenThreads } from "@/hooks/useThreads";
import { useUser, useOrganization, useOrganizationList } from "@clerk/nextjs";
import type { OrganizationMembershipResource } from "@clerk/shared/types";
import { OrgAvatar } from "@/components/OrgAvatar";
import { navItems } from "./nav-items";

export default function DashboardHeader() {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const { isOpen: isHelpOpen, openHelp, closeHelp } = useHelp();
  const { threads: openThreads } = useOpenThreads();
  const openCount = openThreads.length;
  const { user } = useUser();
  const { organization, memberships } = useOrganization({ memberships: { infinite: false, pageSize: 5 } });
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const otherMembers = (memberships?.data ?? [] as OrganizationMembershipResource[])
    .filter((m: OrganizationMembershipResource) => m.publicUserData?.userId !== user?.id)
    .slice(0, 3);

  const pageTitle = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => pathname === item.href || pathname.startsWith(item.href + "/"))?.name
    ?? (pathname.includes("settings") ? "Settings" : "Dashboard");

  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Desktop-only top header bar */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 px-4 h-[52px] shrink-0 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center">
          <span className="text-sm font-semibold text-slate-800">{pageTitle}</span>
        </div>

        {/* ⌘K search trigger — centered */}
        <button
          onClick={() => setCmdOpen(true)}
          className="flex items-center gap-2 w-96 px-4 py-1.5 rounded-full border border-slate-200 bg-slate-100/70 hover:bg-white hover:border-slate-300 transition-all text-slate-400 hover:text-slate-600"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-xs text-left">Search…</span>
          <kbd className="text-[10px] font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-400 shrink-0">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1 justify-end">
          {/* Team member avatars */}
          {otherMembers.length > 0 && (
            <div className="flex items-center mr-2">
              <div className="flex -space-x-2">
                {otherMembers.map((m: OrganizationMembershipResource) => {
                  const pd = m.publicUserData;
                  const name = [pd?.firstName, pd?.lastName].filter(Boolean).join(" ") || pd?.identifier || "Team";
                  const memberInitials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <div
                      key={m.id}
                      title={name}
                      className="relative w-7 h-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600 overflow-hidden"
                    >
                      {pd?.imageUrl
                        ? <img src={pd.imageUrl} alt={name} className="w-full h-full object-cover" />
                        : memberInitials
                      }
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-white" />
                    </div>
                  );
                })}
              </div>
              <span className="ml-2 text-[11px] text-slate-400">{otherMembers.length} online</span>
            </div>
          )}

          <button
            onClick={() => isHelpOpen ? closeHelp() : openHelp()}
            className={`p-2 rounded-md transition-colors ${isHelpOpen ? "text-slate-700 bg-slate-100" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}
            title="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <div className="relative group">
            <button aria-label="Notifications" title="Notifications" className="relative p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors">
              <Bell className="w-5 h-5" />
              {openCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
              )}
            </button>
            <div className="pointer-events-none group-hover:pointer-events-auto absolute right-0 top-full mt-2 w-72 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-150 z-50">
              <div className="bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">Open Tickets</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${openCount > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400"}`}>
                    {openCount}
                  </span>
                </div>
                {openCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Bell className="w-6 h-6 text-slate-200" />
                    <p className="text-sm text-slate-400">No open tickets</p>
                  </div>
                ) : (
                  <Link
                    href="/dashboard/tickets"
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <p className="text-sm text-slate-700">{openCount} ticket{openCount !== 1 ? "s" : ""} need attention</p>
                    <span className="text-xs font-semibold text-teal-700">View →</span>
                  </Link>
                )}
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
              <span className="text-xs font-semibold text-slate-700 max-w-[140px] truncate">{organization?.name ?? "Workspace"}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${orgDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {orgDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOrgDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-md shadow-2xl overflow-hidden z-50">
                  {userMemberships.data?.map((mem: { organization: { id: string; name: string; imageUrl?: string } }) => (
                    <button
                      key={mem.organization.id}
                      onClick={() => { setActive?.({ organization: mem.organization.id }); setOrgDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${mem.organization.id === organization?.id ? "bg-slate-50" : ""}`}
                    >
                      <OrgAvatar name={mem.organization.name} imageUrl={mem.organization.imageUrl} className="w-5 h-5 rounded bg-slate-200 text-[10px] text-slate-600" />
                      <span className="flex-1 text-xs font-medium text-slate-700 truncate">{mem.organization.name}</span>
                      {mem.organization.id === organization?.id && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                    </button>
                  ))}
                  <div className="border-t border-slate-100">
                    <Link
                      href="/create-org"
                      onClick={() => setOrgDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors"
                    >
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
    </>
  );
}
