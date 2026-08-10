"use client"

import { Check, KeyRound, Radio } from "lucide-react"
import type { WorkspaceIntegrationDefinition } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ConfigureSection } from "./ConfigureSection"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"
import { ShopifyPermissionRows } from "./ShopifyPermissionsPanel"
import { getInstagramConnectionDisplay } from "./integration-card-helpers"

export function IntegrationPermissionsSection({
  definition,
  integration,
}: {
  definition: WorkspaceIntegrationDefinition
  integration: Integration | null
}) {
  if (definition.kind === "forwarding-email") return null

  if (definition.connectType === "shopify") {
    return (
      <ConfigureSection title="Permissions">
        <ShopifyPermissionRows />
      </ConfigureSection>
    )
  }

  const instagramConnection = definition.id === "instagram" && integration
    ? getInstagramConnectionDisplay(integration)
    : null

  const rows = [
    ...(instagramConnection ? [
      <PermissionRow
        key="instagram-token"
        icon={KeyRound}
        title="Instagram access token"
        description={instagramConnection.token.description}
        action={<PermissionActionLink>{instagramConnection.token.action}</PermissionActionLink>}
      />,
      <PermissionRow
        key="instagram-subscription"
        icon={Radio}
        title="Direct Message subscription"
        description={instagramConnection.subscription.description}
        action={<PermissionActionLink>{instagramConnection.subscription.action}</PermissionActionLink>}
      />,
    ] : []),
    ...definition.permissions.map((permission) => (
      <PermissionRow
        key={permission}
        icon={Check}
        title={permission}
        action={(
          <PermissionActionLink>
            Connected
          </PermissionActionLink>
        )}
      />
    )),
  ]

  if (rows.length === 0) return null
  return <ConfigureSection title="Permissions">{rows}</ConfigureSection>
}
