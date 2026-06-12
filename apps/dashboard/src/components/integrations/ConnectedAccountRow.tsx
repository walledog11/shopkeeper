import type { ConnectType } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { AtSign, MessageSquare, ShoppingBag } from "lucide-react"
import { ConfigureAccountRow } from "./ConfigureAccountRow"
import { PermissionActionLink } from "./PermissionRow"

const CONNECTION_ICONS = {
  email: AtSign,
  ig: MessageSquare,
  shopify: ShoppingBag,
} as const

export function ConnectedAccountRow({
  connectType,
  integration,
}: {
  connectType: ConnectType
  integration: Integration
}) {
  return (
    <ConfigureAccountRow
      icon={CONNECTION_ICONS[connectType]}
      title={integration.fromEmail || integration.externalAccountId}
      action={<PermissionActionLink>Connected</PermissionActionLink>}
    />
  )
}
