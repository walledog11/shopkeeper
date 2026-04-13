"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, HelpCircle, Search, UserPlus } from "lucide-react";
import CommandPalette from "./CommandPalette";
import { useHelp } from "./help/HelpContext";
import { useOpenThreadCount } from "./DashboardSidebar";
import { useUser, useOrganization } from "@clerk/nextjs";
import type { OrganizationMembershipResource } from "@clerk/shared/types";
import { OrgAvatar } from "@/components/OrgAvatar";
import { Badge } from "@/components/ui/badge";
import { navItems } from "./nav-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { isOpen: isHelpOpen, openHelp, closeHelp } = useHelp();
  const openCount = useOpenThreadCount();
  const { user } = useUser();
  const { memberships } = useOrganization({ memberships: { infinite: false, pageSize: 5 } });

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
    ?? "Dashboard";

  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Desktop-only header */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] items-center border-b border-border px-4 h-12 shrink-0 bg-background/80 backdrop-blur-sm">

        {/* Left: page title */}
        <div className="flex items-center">
          <span className="text-sm font-semibold text-white/80">{pageTitle}</span>
        </div>

        {/* Center: search trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="flex items-center gap-2 w-100 px-4 py-1.5 rounded-full border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all text-white/30 hover:text-white/50"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-xs text-left">Search…</span>
          <kbd className="text-[10px] font-semibold bg-white/[0.06] border border-white/[0.10] px-1.5 rounded text-white/30 shrink-0">⌘K</kbd>
        </button>

        {/* Right: controls */}
        <div className="flex items-center gap-1 justify-end">

          {/* Team avatars */}
          {otherMembers.length > 0 && (
            <div className="flex items-center mr-2">
              <div className="flex -space-x-2">
                {otherMembers.map((m: OrganizationMembershipResource) => {
                  const pd = m.publicUserData;
                  const name = [pd?.firstName, pd?.lastName].filter(Boolean).join(" ") || pd?.identifier || "Team";
                  return (
                    <div key={m.id} title={name} className="relative shrink-0">
                      <OrgAvatar
                        name={name}
                        imageUrl={pd?.imageUrl ?? null}
                        className="w-7 h-7 rounded-full bg-white/10 border-2 border-background text-[10px] font-bold text-white/70"
                      />
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-background" />
                    </div>
                  );
                })}
              </div>
              <span className="ml-2 text-[11px] text-white/30">{otherMembers.length} online</span>
            </div>
          )}

          {/* Invite */}
          <button
            onClick={() => router.push("/dashboard/team?invite=1")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-black bg-green-400 hover:bg-green-300 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite
          </button>

          {/* Help */}
          <button
            onClick={() => isHelpOpen ? closeHelp() : openHelp()}
            className={`p-2 rounded-md transition-colors ${
              isHelpOpen
                ? "text-white/80 bg-white/[0.08]"
                : "text-white/30 hover:text-white/70 hover:bg-white/[0.06]"
            }`}
            title="Help"
          >
            <HelpCircle className="w-4.5 h-4.5" />
          </button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Notifications"
                className="relative p-2 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded-md transition-colors"
              >
                <Bell className="w-4.5 h-4.5" />
                {openCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-background" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 bg-popover border-white/[0.09] text-white p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
                <p className="text-xs font-bold text-white/70 uppercase tracking-wide">Open Tickets</p>
                <Badge variant="ghost" className={`text-[10px] font-semibold ${
                  openCount > 0 ? "bg-red-500/20 text-red-400" : "bg-white/[0.06] text-white/30"
                }`}>
                  {openCount}
                </Badge>
              </div>
              {openCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Bell className="w-5 h-5 text-white/15" />
                  <p className="text-sm text-white/30">No open tickets</p>
                </div>
              ) : (
                <Link
                  href="/dashboard/tickets"
                  className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.05] transition-colors"
                >
                  <p className="text-sm text-white/70">{openCount} ticket{openCount !== 1 ? "s" : ""} need attention</p>
                  <span className="text-xs font-semibold text-white/40">View →</span>
                </Link>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </>
  );
}
