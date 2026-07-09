"use client"

import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PermissionActionLink } from "./PermissionRow"

export function GmailSupportAddressPanel({
  email,
  loading,
  onSave,
  setEmail,
  variant = "workspace",
}: {
  email: string
  loading: boolean
  onSave: () => void
  setEmail: (value: string) => void
  variant?: "workspace"
}) {
  return (
    <div className="space-y-3 bg-foreground/[0.02] px-4 py-4 sm:px-5">
      <div>
        <p className="text-[13px] font-semibold text-foreground/80">
          Address customers email
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground/50">
          {variant === "workspace"
            ? "For example support@yourstore.com. This must already be set up as a send-as address in your Google Workspace Gmail settings."
            : null}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Input
          aria-label="Address customers email"
          type="email"
          placeholder="support@yourstore.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave()
          }}
          className="h-10 flex-1 border-foreground/[0.10] bg-foreground/[0.03] text-sm text-white placeholder:text-foreground/30"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          {loading && <Loader2 className="size-3.5 animate-spin text-foreground/50" />}
          <PermissionActionLink onClick={onSave} disabled={!email.trim() || loading}>
            Save address
          </PermissionActionLink>
        </div>
      </div>
    </div>
  )
}
