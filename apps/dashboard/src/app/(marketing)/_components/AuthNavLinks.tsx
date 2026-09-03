"use client";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LayoutDashboard, LogOut } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const quietLinkClass = "m-nav-login";

const primaryLinkClass = "m-nav-cta";

function AuthNavLoading() {
  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-label="Loading account actions"
    >
      <span className="hidden h-10 w-16 animate-pulse rounded-full bg-[#2b2118]/8 md:inline-flex" />
      <span className="h-11 w-[7.5rem] animate-pulse rounded-full bg-[#2b2118]/12 md:h-10" />
    </div>
  );
}

function AccountMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();

  const name = user?.fullName ?? user?.firstName ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open account menu for ${name}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full outline-none ring-offset-2 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#2b2118]"
        >
          <OrgAvatar
            name={name}
            imageUrl={user?.imageUrl}
            className="size-9 border border-[#2b2118]/15 bg-[#efe9df] text-sm font-semibold text-[#2b2118]"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-44 rounded-xl border-[#2b2118]/10 bg-[#faf6ef] p-1.5 text-[#2b2118] shadow-xl"
      >
        <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2.5 py-2">
          <Link href="/dashboard">
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer rounded-lg px-2.5 py-2"
          onSelect={() => void signOut({ redirectUrl: "/" })}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AuthNavLinks() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <AuthNavLoading />;
  }

  if (!isSignedIn) {
    return (
      <>
        <Link href="/login" className={quietLinkClass}>
          Log in
        </Link>
        <Link href="/signup" className={primaryLinkClass}>
          {PRIMARY_CTA_LABEL}
        </Link>
      </>
    );
  }

  return <AccountMenu />;
}
