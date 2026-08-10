"use client"

import { useState } from "react"
import { Check, Mail, MessageSquare, RefreshCw, Trash2 } from "lucide-react"
import { useOrg } from "@/hooks/useOrg"
import type { Integration } from "@/types"
import { ActionRow } from "./ActionRow"
import { ConfigureSection } from "./ConfigureSection"
import { ConnectedAccountRow } from "./ConnectedAccountRow"
import { CopyButton } from "./CopyButton"
import { GmailSupportAddressPanel } from "./GmailSupportAddressPanel"
import {
  GMAIL_FORWARDING_GUIDE,
  type GmailPresentation,
  gmailCustomerAddress,
  gmailReplyAddress,
  isGmailWorkspaceAccount,
} from "./gmail-configure-state"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"

const DISCONNECT_NOTE =
  "Your past tickets stay. New customer emails will stop arriving."

function GmailForwardingSection({
  customerAddress,
  inboundAddress,
}: {
  customerAddress: string
  inboundAddress: string | null
}) {
  return (
    <ConfigureSection title="Forward your mail">
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <p className="text-[12.5px] leading-relaxed text-foreground/55">
          Forward email sent to{" "}
          <span className="font-medium text-foreground/80">{customerAddress}</span>
          {" "}to Shopkeeper so customer messages appear as tickets.
        </p>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-foreground/80">
            Shopkeeper forwarding address
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5">
            {inboundAddress ? (
              <>
                <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground/75">
                  {inboundAddress}
                </p>
                <CopyButton text={inboundAddress} />
              </>
            ) : (
              <p className="text-sm text-foreground/35">Loading…</p>
            )}
          </div>
        </div>
        <ol className="list-inside list-decimal space-y-1.5 text-[13px] leading-relaxed text-foreground/55">
          {GMAIL_FORWARDING_GUIDE.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </ConfigureSection>
  )
}

function GmailEmailSection({
  integration,
  presentation,
  isWorkspace,
}: {
  integration: Integration
  presentation: GmailPresentation
  isWorkspace: boolean
}) {
  const { receiving, scene } = presentation
  const replyDescription = isWorkspace
    ? `Replies send from ${gmailReplyAddress(integration)}`
    : "Replies send from your Gmail address"

  return (
    <ConfigureSection title="Email">
      <PermissionRow
        icon={MessageSquare}
        title="Customer replies"
        description={replyDescription}
        action={<PermissionActionLink>Active</PermissionActionLink>}
      />
      {scene === "ready" ? (
        <PermissionRow
          icon={Mail}
          title={receiving.title}
          description={receiving.description}
          action={
            <PermissionActionLink>
              {receiving.status}
            </PermissionActionLink>
          }
        />
      ) : null}
    </ConfigureSection>
  )
}

function GmailReadyNote({ isWorkspace }: { isWorkspace: boolean }) {
  return (
    <div className="flex items-start gap-2 px-1 text-xs leading-relaxed text-foreground/45">
      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600/80" aria-hidden />
      <p>
        {isWorkspace
          ? "Google Workspace is connected. Customer emails will appear here when they arrive at your support address."
          : "Gmail is connected. Customer emails will appear in your inbox when they arrive."}
      </p>
    </div>
  )
}

function GmailActionsSection({
  scene,
  confirmingDelete,
  onReauthorize,
  onConfirmDelete,
  onRequestDelete,
  isDefaultEmail,
  onSetDefaultEmail,
  canManageWorkspace,
}: {
  scene: GmailPresentation["scene"]
  confirmingDelete: boolean
  onReauthorize: () => void
  onConfirmDelete: () => void
  onRequestDelete: () => void
  isDefaultEmail: boolean
  onSetDefaultEmail?: () => void
  canManageWorkspace: boolean
}) {
  return (
    <ConfigureSection title="Actions">
      {!isDefaultEmail && onSetDefaultEmail ? (
        <ActionRow icon={Mail} label="Use for new emails" onClick={onSetDefaultEmail} disabled={!canManageWorkspace} />
      ) : null}
      {scene !== "needs_reconnect" ? (
        <ActionRow icon={RefreshCw} label="Reconnect account" onClick={onReauthorize} disabled={!canManageWorkspace} />
      ) : null}
      <ActionRow
        icon={Trash2}
        label="Delete connection"
        destructive
        onClick={onRequestDelete}
        disabled={!canManageWorkspace}
      />
      {confirmingDelete ? (
        <div className="flex items-center justify-between gap-3 bg-foreground/[0.02] px-4 py-3.5">
          <p className="text-xs leading-relaxed text-foreground/55">{DISCONNECT_NOTE}</p>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="shrink-0 text-xs font-semibold whitespace-nowrap text-red-600 transition-colors hover:text-red-700"
          >
            Confirm
          </button>
        </div>
      ) : null}
    </ConfigureSection>
  )
}

export function GmailConnectedConfigureBody({
  integration,
  presentation,
  email,
  setEmail,
  emailLoading,
  onEmailSave,
  onReauthorize,
  onDisconnect,
  onSetDefaultEmail,
  canManageWorkspace,
}: {
  integration: Integration
  presentation: GmailPresentation
  email: string
  setEmail: (value: string) => void
  emailLoading: boolean
  onEmailSave: () => void
  onReauthorize: () => void
  onDisconnect: (integrationId: string) => void
  onSetDefaultEmail?: (integrationId: string) => void
  canManageWorkspace: boolean
}) {
  const { scene } = presentation
  const isWorkspace = isGmailWorkspaceAccount(integration)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const needsForwardingData = scene === "needs_forwarding" || (isWorkspace && scene !== "needs_reconnect")
  const { data: org } = useOrg({ enabled: needsForwardingData })
  const inboundAddress = org?.id && org.inboundEmailDomain
    ? `${org.id}@${org.inboundEmailDomain}`
    : null
  const customerAddress = gmailCustomerAddress(integration)

  return (
    <div className="space-y-5">
      <ConnectedAccountRow connectType="email" integration={integration} />

      {scene === "needs_reconnect" ? (
        <ConfigureSection title="Connection">
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <p className="text-xs leading-relaxed text-foreground/55">
              {presentation.statusLine ?? "Reconnect Gmail to restore access."}
            </p>
            <button
              type="button"
              onClick={onReauthorize}
              disabled={!canManageWorkspace}
              className="inline-flex h-9 items-center rounded-md border border-foreground/[0.15] bg-foreground/[0.08] px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.14]"
            >
              Reconnect Gmail
            </button>
          </div>
        </ConfigureSection>
      ) : null}

      {isWorkspace && scene !== "needs_reconnect" ? (
        <ConfigureSection title="Support address">
          <GmailSupportAddressPanel
            variant="workspace"
            email={email}
            setEmail={setEmail}
            loading={emailLoading}
            onSave={onEmailSave}
            disabled={!canManageWorkspace}
          />
        </ConfigureSection>
      ) : null}

      {scene === "needs_forwarding" ? (
        <GmailForwardingSection
          customerAddress={customerAddress}
          inboundAddress={inboundAddress}
        />
      ) : null}

      {scene !== "needs_reconnect" ? (
        <GmailEmailSection
          integration={integration}
          presentation={presentation}
          isWorkspace={isWorkspace}
        />
      ) : null}

      <GmailActionsSection
        scene={scene}
        confirmingDelete={confirmingDelete}
        onReauthorize={onReauthorize}
        onRequestDelete={() => setConfirmingDelete(true)}
        isDefaultEmail={integration.isDefaultEmail === true}
        onSetDefaultEmail={onSetDefaultEmail
          ? () => onSetDefaultEmail(integration.id)
          : undefined}
        onConfirmDelete={() => {
          setConfirmingDelete(false)
          onDisconnect(integration.id)
        }}
        canManageWorkspace={canManageWorkspace}
      />

      {scene === "ready" ? <GmailReadyNote isWorkspace={isWorkspace} /> : null}
    </div>
  )
}
