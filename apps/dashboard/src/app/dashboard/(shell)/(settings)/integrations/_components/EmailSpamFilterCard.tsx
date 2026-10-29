"use client"

import { useState } from "react"
import { useOrganization } from "@clerk/nextjs"
import { ToggleRow } from "@/components/settings-form/shared"
import { useOrg } from "@/hooks/useOrg"
import { patchSpamFilterEnabled } from "@/lib/org/org-requests"
import { SOLID_SETTINGS_TILE } from "@/lib/ui/glass-card-styles"

export function EmailSpamFilterCard() {
  const { membership } = useOrganization()
  const isAdmin = membership?.role === "org:admin"
  const { data: org, mutate, isLoading } = useOrg({ revalidateOnFocus: false })
  const [pending, setPending] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checked = pending ?? org?.settings.spamFilterEnabled !== false
  const disabled = !isAdmin || isLoading || !org || pending !== null

  async function onChange(value: boolean) {
    if (!org || disabled) return
    setError(null)
    setPending(value)
    try {
      const saved = await patchSpamFilterEnabled(value, org.version)
      await mutate((current) => ({
        ...(current ?? org),
        version: saved.version,
        settings: {
          ...(current?.settings ?? org.settings),
          spamFilterEnabled: value,
        },
        name: saved.name ?? current?.name ?? org.name,
      }), { revalidate: false })
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "conflict"
        ? "Someone else saved workspace settings. Refresh and try again."
        : "Could not update the spam filter. Try again.")
      await mutate()
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={SOLID_SETTINGS_TILE}>
      <ToggleRow
        label="Filter spam emails"
        description="When on, filtered emails are hidden from your inbox and purged after 7 days unless you recover them."
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
      {!isAdmin ? (
        <p className="mt-3 text-xs text-faint">Only workspace admins can change inbound email filtering.</p>
      ) : null}
    </div>
  )
}
