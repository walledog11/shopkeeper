import type { LucideIcon } from "lucide-react"
import type { ConnectType } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { AtSign, MessageSquare, ShoppingBag } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"

const CONNECTION_ICONS: Record<ConnectType, LucideIcon> = {
  email: AtSign,
  ig: MessageSquare,
  shopify: ShoppingBag,
}

const CONNECTION_DESCRIPTIONS: Record<ConnectType, string> = {
  email: "Connected inbox",
  ig: "Connected business account",
  shopify: "Connected store",
}

export function ConnectedAccountRow({
  connectType,
  integration,
}: {
  connectType: ConnectType
  integration: Integration
}) {
  return (
    <div className={cn(
      "rounded-xl border border-white/[0.12] bg-white/[0.04]",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    )}>
      <PermissionRow
        icon={CONNECTION_ICONS[connectType]}
        title={integration.fromEmail || integration.externalAccountId}
        description={CONNECTION_DESCRIPTIONS[connectType]}
        action={<PermissionActionLink>Connected</PermissionActionLink>}
      />
    </div>
  )
}
