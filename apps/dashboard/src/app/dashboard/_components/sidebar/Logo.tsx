"use client";

import Link from "next/link";
import { dispatchNavProgressStart } from "./sidebar-helpers";

export function Logo() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-1.5"
      onClick={() => {
        const pathname = window.location.pathname;
        if (pathname !== "/dashboard") dispatchNavProgressStart();
      }}
    >
      <span className="text-xl font-black text-white tracking-tight">clerk</span>
      <span className="size-2 rounded-full bg-green-400 self-start mt-1.5 shrink-0" />
    </Link>
  );
}
