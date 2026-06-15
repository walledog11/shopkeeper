"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { errorMessageFromUnknown, fetcher } from "@/lib/api/fetcher"
import {
  formatLTV,
  fullName,
  type CustomerDetailResponse,
  type CustomerRow,
  type EditState,
  type ShopifyOrder,
} from "./customers-page-utils"
import {
  makeCustomerEditDraft,
  saveCustomerUpdates,
  startCustomerSupportThread,
} from "./customer-drawer-requests"

export interface CustomerDrawerContentProps {
  customer: CustomerRow
  shop: string
  onClose: () => void
  onCustomerUpdated: (c: Partial<CustomerRow>) => void
}

export function useCustomerDrawerState({
  customer: initial,
  onCustomerUpdated,
  shop,
}: CustomerDrawerContentProps) {
  const { push } = useRouter()

  const { data, mutate } = useSWR<CustomerDetailResponse>(
    `/api/shopify/customer?customerId=${initial.id}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const customer = data?.customer ?? initial
  const orders: ShopifyOrder[] = data?.orders ?? []
  const detailShop = data?.shop ?? shop
  const isLoadingDetail = !data

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditState>(() => makeCustomerEditDraft(initial))

  const startEdit = () => {
    setDraft(makeCustomerEditDraft(customer))
    setIsEditing(true)
    setSaveError(null)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const updated = await saveCustomerUpdates(customer.id, draft)
      const nextCustomer = { ...customer, ...updated } as CustomerRow
      void mutate(
        data
          ? { ...data, customer: nextCustomer }
          : { customer: nextCustomer, orders, shop: detailShop },
        false,
      )
      onCustomerUpdated({
        first_name: nextCustomer.first_name,
        last_name: nextCustomer.last_name,
        email: nextCustomer.email,
        phone: nextCustomer.phone ?? null,
      })
      setIsEditing(false)
    } catch (error) {
      setSaveError(errorMessageFromUnknown(error, "Failed to save customer."))
    } finally {
      setIsSaving(false)
    }
  }

  const [isStartingThread, setIsStartingThread] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)

  const handleStartThread = async () => {
    setIsStartingThread(true)
    setThreadError(null)
    try {
      const threadId = await startCustomerSupportThread(customer)
      push(`/dashboard/tickets?thread=${threadId}`)
    } catch (error) {
      setThreadError(errorMessageFromUnknown(error, "Failed to start support thread."))
    } finally {
      setIsStartingThread(false)
    }
  }

  const shopifyAdminUrl = detailShop
    ? `https://${detailShop}/admin/customers/${customer.id}`
    : null
  const addr = customer.default_address
  const hasAddress = !!(addr?.address1 || addr?.city || addr?.province || addr?.zip || addr?.country_name)

  return {
    addr,
    cancelEdit,
    customer,
    detailShop,
    draft,
    handleSave,
    handleStartThread,
    hasAddress,
    isEditing,
    isLoadingDetail,
    isSaving,
    isStartingThread,
    ltv: formatLTV(customer.total_spent),
    name: fullName(customer),
    orders,
    saveError,
    setDraft,
    shopifyAdminUrl,
    startEdit,
    threadError,
  }
}

export type CustomerDrawerState = ReturnType<typeof useCustomerDrawerState>
