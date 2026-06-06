"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useOrganization } from "@clerk/nextjs"
import useSWR from "swr"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { fetcher } from "@/lib/api/fetcher"
import { buildShopifyCustomerKey } from "@/lib/shopify/customer-key"
import type { CannedResponse } from "@/types"
import type { ShopifyData } from "@/types/shopify"
import type { ComposerProps, IntegrationRow } from "./composer-types"
import {
  buildCannedResponseBody,
  buildComposerPlaceholder,
  EMPTY_CANNED_RESPONSES,
  filterCannedResponses,
  insertCannedResponseValue,
  isInstagramReplyWindowExpired,
} from "./composer-utils"

export function useComposerState({
  customerName,
  agentName = "Clerk",
  channelType,
  shopifyCustomerId,
  customerPlatformId,
  lastCustomerMessageAt,
  value,
  isClerkMode = false,
  viewTab,
  onViewTabChange,
  isSending,
  onChange,
}: ComposerProps) {
  const { organization } = useOrganization()

  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const shouldRestoreTextareaFocusRef = useRef(false)

  const isNoteTab = viewTab === "notes"
  const isEmailLike = channelType === "email" || channelType === "shopify"
  const igWindowExpired = isInstagramReplyWindowExpired({
    channelType,
    isClerkMode,
    isNoteTab,
    lastCustomerMessageAt,
  })

  const { data: cannedData } = useSWR<{ responses: CannedResponse[] }>(
    slashQuery !== null ? "/api/canned-responses" : null,
    fetcher,
  )

  const { data: integrations } = useSWR<IntegrationRow[]>(
    isEmailLike ? "/api/integrations" : null,
    fetcher,
  )
  const emailIntegration = integrations?.find(i => i.platform === "email")
  const senderEmail = emailIntegration?.fromEmail || emailIntegration?.externalAccountId || null

  const shopifySwrKey = buildShopifyCustomerKey({
    channelType,
    customerPlatformId,
    shopifyCustomerId,
    orderLimit: 1,
  })
  const { data: shopifyData } = useSWR<ShopifyData>(shopifySwrKey, fetcher, {
    revalidateOnFocus: false,
  })

  const cannedResponses = cannedData?.responses ?? EMPTY_CANNED_RESPONSES
  const filteredCanned = useMemo(
    () => filterCannedResponses(cannedResponses, slashQuery, channelType),
    [cannedResponses, channelType, slashQuery],
  )
  const selectedCannedIdx = filteredCanned.length > 0 ? Math.min(selectedIdx, filteredCanned.length - 1) : 0

  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedCannedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [selectedCannedIdx])

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

  const handleTextChange = (newValue: string) => {
    onChange(newValue)
    const match = newValue.match(/(^|\s)\/(\S*)$/)
    setSlashQuery(match ? match[2] : null)
    setSelectedIdx(0)
  }

  const insertCanned = (response: CannedResponse) => {
    const shopifyCustomer = shopifyData?.customer
    const shopifyOrders = shopifyData?.orders ?? []
    const body = buildCannedResponseBody(response, {
      customerFirstName: shopifyCustomer?.first_name,
      orderName: shopifyOrders[0]?.name,
      storeName: organization?.name,
    })
    onChange(insertCannedResponseValue(value, body))
    setSlashQuery(null)
    setSelectedIdx(0)
    textareaRef.current?.focus()
    fetch(`/api/canned-responses/${response.id}/use`, { method: "POST" }).catch(() => {})
  }

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
    filteredCanned,
    handleTextChange,
    handleViewTabSelect,
    igWindowExpired,
    insertCanned,
    isEmailLike,
    isNoteTab,
    listRef,
    placeholder,
    rememberTextareaFocus,
    selectedCannedIdx,
    senderEmail,
    sendDisabled,
    setSelectedIdx,
    setSlashQuery,
    slashQuery,
    textareaRef,
  }
}

export type ComposerState = ReturnType<typeof useComposerState>
