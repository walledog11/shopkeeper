"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"

interface ChannelConnection {
  connected: boolean
}

/**
 * Whether the current member has bound a phone operator channel — Telegram or
 * iMessage. Both are equivalent surfaces for plan approvals, so nudges and
 * onboarding steps must treat "bound to either" as done rather than keying on
 * Telegram alone.
 */
export function useOperatorChannels(enabled = true) {
  const { data: telegram } = useSWR<ChannelConnection>(
    enabled ? "/api/integrations/telegram" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: imessage } = useSWR<ChannelConnection>(
    enabled ? "/api/integrations/imessage/bind" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const telegramBound = telegram?.connected ?? false
  const imessageBound = imessage?.connected ?? false

  return {
    telegramBound,
    imessageBound,
    anyBound: telegramBound || imessageBound,
    isLoading: enabled && (telegram === undefined || imessage === undefined),
  }
}
