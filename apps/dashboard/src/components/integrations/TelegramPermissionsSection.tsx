"use client"

import { Bell, Check } from "lucide-react"
import { ConfigureSection } from "./ConfigureSection"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"

const TELEGRAM_PERMISSIONS = [
  "Approve agent replies",
  "Receive ticket digests",
] as const

export function TelegramPermissionsSection() {
  return (
    <ConfigureSection title="Permissions">
      {TELEGRAM_PERMISSIONS.map((permission) => (
        <PermissionRow
          key={permission}
          icon={permission === "Receive ticket digests" ? Bell : Check}
          title={permission}
          action={<PermissionActionLink>Connected</PermissionActionLink>}
        />
      ))}
    </ConfigureSection>
  )
}
