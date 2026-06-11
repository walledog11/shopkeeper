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
    <ConfigureAccountRow
      icon={CONNECTION_ICONS[connectType]}
      title={integration.fromEmail || integration.externalAccountId}
      description={CONNECTION_DESCRIPTIONS[connectType]}
      action={<PermissionActionLink>Connected</PermissionActionLink>}
    />
  )
}
