"use client"

import { useCallback, useEffect, useRef } from "react"
import useSWR from "swr"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { fetcher } from "@/lib/api/fetcher"
import type { ComposerProps, IntegrationRow } from "./composer-types"
import { buildComposerPlaceholder, isInstagramReplyWindowExpired } from "./composer-utils"

export function useComposerState({
  customerName,
  agentName = "Shopkeeper",
  channelType,
  lastCustomerMessageAt,
  value,
  isAgentMode = false,
  viewTab,
  onViewTabChange,
  isSending,
  onChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldRestoreTextareaFocusRef = useRef(false)

  const isNoteTab = viewTab === "notes"
  const isEmailLike = channelType === "email" || channelType === "shopify"
  const igWindowExpired = isInstagramReplyWindowExpired({
    channelType,
    isAgentMode,
    isNoteTab,
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
    agentName,
    customerName,
    isMobile,
    isNoteTab,
  })

  const sendDisabled = !value.trim() || isSending || igWindowExpired
  const rememberTextareaFocus = () => {
    shouldRestoreTextareaFocusRef.current = document.activeElement === textareaRef.current
  }
  const handleViewTabSelect = (tab: "chat" | "notes") => {
    onViewTabChange(tab)

    if (shouldRestoreTextareaFocusRef.current) {
      requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
    }

    shouldRestoreTextareaFocusRef.current = false
  }

  return {
    handleViewTabSelect,
    igWindowExpired,
    isEmailLike,
    isNoteTab,
    onChange,
    placeholder,
    rememberTextareaFocus,
    senderEmail,
    sendDisabled,
    textareaRef,
  }
}

export type ComposerState = ReturnType<typeof useComposerState>
