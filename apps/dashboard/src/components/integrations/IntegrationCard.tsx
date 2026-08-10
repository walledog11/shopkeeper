"use client"

import { cn } from "@/lib/ui/cn"
import { IntegrationCardDetails, type IntegrationCardCallbacks } from "./IntegrationCardDetails"
import type { IntegrationCardModel } from "./integration-presentation"
import { IntegrationCardHeader } from "./IntegrationCardParts"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import {
  CARD_ACTIONS,
  CARD_BUTTON_AMBER,
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
} from "./integration-card-styles"

export default function IntegrationCard({
  callbacks,
  model,
  onOpenChange,
  open,
  shopifyClientId,
  storefrontChatGloballyEnabled,
}: {
  callbacks: IntegrationCardCallbacks
  model: IntegrationCardModel
  onOpenChange: (open: boolean) => void
  open: boolean
  shopifyClientId: string | null
  storefrontChatGloballyEnabled: boolean
}) {
  const { availability, definition } = model

  function connect() {
    if (!model.canManageWorkspace || !model.connectAction) return
    if (model.connectAction.kind === "open-details") {
      onOpenChange(true)
      return
    }
    callbacks.launchOAuth(model.connectAction.definition, {})
  }

  function recover() {
    if (!model.canManageWorkspace || !model.recoveryAction) return
    callbacks.launchOAuth(
      model.recoveryAction.definition,
      model.recoveryAction.params,
      undefined,
      model.recoveryAction.reauthorize,
    )
  }
  const availabilityBlocksCard = availability.state !== "available"
    && !(availability.state === "private-beta" && model.isConnected)

  return (
    <>
      <div id={definition.id} className={CARD_SHELL}>
        <IntegrationCardHeader config={definition} />
        <p className={CARD_DESCRIPTION}>{definition.description}</p>
        {model.isConnected && model.selectedConnection?.isDefaultEmail ? (
          <p className="text-xs font-medium text-emerald-600/90">Default for new emails</p>
        ) : null}

        <div className={CARD_ACTIONS}>
          {availabilityBlocksCard ? (
            <button type="button" disabled className={CARD_BUTTON_DISABLED}>{availability.label}</button>
          ) : !model.isConnected ? (
            <button
              type="button"
              onClick={connect}
              disabled={!model.canManageWorkspace}
              className={cn(CARD_BUTTON_PRIMARY, "w-full flex-1")}
            >
              Connect
            </button>
          ) : (
            <>
              {model.recoveryAction ? (
                <button
                  type="button"
                  onClick={recover}
                  disabled={!model.canManageWorkspace}
                  className={CARD_BUTTON_AMBER}
                >
                  {model.recoveryAction.label}
                </button>
              ) : null}
              <button type="button" onClick={() => onOpenChange(true)} className={CARD_BUTTON_SECONDARY}>
                Configure
              </button>
            </>
          )}
        </div>
      </div>

      {definition.kind === "oauth" || definition.kind === "forwarding-email" ? (
        <IntegrationConfigureDialog
          open={open}
          onOpenChange={onOpenChange}
          config={definition}
          statusState={model.isConnected ? model.status : undefined}
          statusLine={model.dialogStatusLine}
          statusNote={Boolean(model.note)}
          preventInitialFocus={model.preventInitialFocus}
        >
          <IntegrationCardDetails
            model={model}
            callbacks={callbacks}
            shopifyClientId={shopifyClientId}
            storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
          />
        </IntegrationConfigureDialog>
      ) : null}
    </>
  )
}
