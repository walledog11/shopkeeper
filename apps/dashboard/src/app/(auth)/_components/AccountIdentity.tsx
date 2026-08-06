"use client";

import { OrgAvatar } from "@/components/OrgAvatar";

interface AccountIdentityProps {
  fullName: string;
  email?: string;
  imageUrl?: string | null;
}

export function AccountIdentity({ fullName, email, imageUrl }: AccountIdentityProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
      <OrgAvatar
        name={fullName}
        imageUrl={imageUrl}
        className="size-9 shrink-0 rounded-full bg-foreground/20 text-xs font-bold text-foreground ring-1 ring-foreground/20"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{fullName}</p>
        {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
      </div>
    </div>
  );
}
