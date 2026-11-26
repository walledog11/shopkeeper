import { getEmailProvider } from "@shopkeeper/email/providers"

export type EmailIntegrationLike = {
  platform?: string
  emailProvider?: "gmail" | "postmark" | null
  fromEmail?: string | null
  externalAccountId?: string
  metadata?: unknown | null
} | null | undefined

export function isEmailIntegrationConfigured(integration: EmailIntegrationLike): boolean {
  if (!integration || integration.platform !== "email") return false
  if (getEmailProvider(integration) === "postmark") return true
  return !!((integration.fromEmail ?? integration.externalAccountId)?.trim())
}
