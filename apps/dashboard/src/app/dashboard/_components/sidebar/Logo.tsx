"use client";

import Link from "next/link";
import { dispatchNavProgressStart } from "./sidebar-helpers";
import Image from "next/image";

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
      <Image
      src="/logos/shopkeeper-neon-2.png"
      alt="shopkeeper-logo"
      width={100}
      height={100}
    />
    </Link>
  );
}
