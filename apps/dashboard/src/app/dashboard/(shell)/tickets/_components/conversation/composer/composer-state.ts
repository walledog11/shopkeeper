"use client"

import { useCallback, useEffect, useRef } from "react"
import useSWR from "swr"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { fetcher } from "@/lib/api/fetcher"
import type { ComposerProps, IntegrationRow } from "./composer-types"
import { buildComposerPlaceholder, isInstagramReplyWindowExpired } from "./composer-utils"

export function useComposerState({
  customerName,
  channelType,
  lastCustomerMessageAt,
  value,
  isAgentMode = false,
  isSending,
  onChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isEmailLike = channelType === "email" || channelType === "shopify"
  const igWindowExpired = isInstagramReplyWindowExpired({
    channelType,
    isAgentMode,
    lastCustomerMessageAt,
  })

  const { data: integrations } = useSWR<IntegrationRow[]>(
    isEmailLike ? "/api/integrations" : null,
    fetcher,
  )
  const emailIntegration = integrations?.find(i => i.platform === "email")
  const senderEmail = emailIntegration?.fromEmail || emailIntegration?.externalAccountId || null

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "0px"
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const cap = Math.min(viewportHeight * 0.4, 320)
    ta.style.height = `${Math.min(ta.scrollHeight, cap)}px`
  }, [])
  const resizeTextareaRef = useRef(resizeTextarea)

  useEffect(() => {
    resizeTextareaRef.current = resizeTextarea
  }, [resizeTextarea])

  useEffect(() => {
    resizeTextarea()
  }, [resizeTextarea, value])

  useEffect(() => {
    const handleResize = () => resizeTextareaRef.current()
    window.visualViewport?.addEventListener("resize", handleResize)
    window.addEventListener("resize", handleResize)

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize)
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  const isMobile = useMediaQuery("(max-width: 767px)") === true
  const placeholder = buildComposerPlaceholder({
    customerName,
    isMobile,
  })

  const sendDisabled = !value.trim() || isSending || igWindowExpired

  return {
    igWindowExpired,
    isEmailLike,
    onChange,
    placeholder,
    senderEmail,
    sendDisabled,
    textareaRef,
  }
}

export type ComposerState = ReturnType<typeof useComposerState>
