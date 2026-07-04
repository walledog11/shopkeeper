"use client";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LayoutDashboard, LogOut } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const quietLinkClass =
  "inline-flex items-center whitespace-nowrap px-2 py-2 text-sm font-medium text-[#2b2118] transition-colors hover:text-stone-600 sm:text-[15px]";

const primaryLinkClass =
  "m-glass-btn m-glass-btn-primary whitespace-nowrap px-4 py-2 text-sm sm:px-5 sm:py-2.5";

function AuthNavLoading() {
  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-label="Loading account actions"
    >
      <span className="h-9 w-14 animate-pulse rounded-full bg-[#2b2118]/8 sm:w-16" />
      <span className="h-9 w-20 animate-pulse rounded-full bg-[#2b2118]/12 sm:w-24" />
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
          className="flex size-9 shrink-0 items-center justify-center rounded-full outline-none ring-offset-2 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#2b2118] sm:size-10"
        >
          <OrgAvatar
            name={name}
            imageUrl={user?.imageUrl}
            className="size-8 border border-[#2b2118]/15 bg-[#efe9df] text-xs font-semibold text-[#2b2118] sm:size-9"
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
          <span className="sm:hidden">Sign up</span>
          <span className="hidden sm:inline">Sign up free</span>
        </Link>
      </>
    );
  }

  return <AccountMenu />;
}
