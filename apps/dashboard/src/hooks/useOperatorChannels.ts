"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import type { ImessageMemberStatus } from "@/lib/integrations/imessage-status"
import type { TelegramMemberStatus } from "@/lib/integrations/telegram-status"

/** Telegram and iMessage operator bindings for the signed-in member. */
export function useOperatorChannels(enabled = true) {
  const { data: telegram, mutate: refreshTelegram } = useSWR<TelegramMemberStatus>(
    enabled ? "/api/integrations/telegram" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: imessage, mutate: refreshImessage } = useSWR<ImessageMemberStatus>(
    enabled ? "/api/integrations/imessage/bind" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const telegramBound = telegram?.connected ?? false
  const imessageBound = imessage?.connected ?? false

  return {
    telegram,
    imessage,
    refreshTelegram,
    refreshImessage,
    telegramBound,
    imessageBound,
    anyBound: telegramBound || imessageBound,
    isLoading: enabled && (telegram === undefined || imessage === undefined),
  }
}
