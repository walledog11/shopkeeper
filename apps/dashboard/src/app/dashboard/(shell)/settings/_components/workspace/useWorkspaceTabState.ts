"use client"

import { useState } from "react"
import { useOrganization, useOrganizationList } from "@clerk/nextjs"
import {
  clearWorkspaceTicketsRequest,
  deleteWorkspaceRequest,
  downloadBlob,
  fetchCustomerGdprExport,
  fetchWorkspaceExport,
} from "./workspace-requests"

export interface WorkspaceTabProps {
  orgName: string
  version: string
}

type SetActive = ReturnType<typeof useOrganizationList>["setActive"]

function useWorkspaceExportFlow() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function exportData() {
    setExporting(true)
    setExportError(null)
    try {
      const { blob, filename } = await fetchWorkspaceExport()
      downloadBlob(blob, filename)
    } catch {
      setExportError("Failed to export. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  return {
    exportData,
    exportError,
    exporting,
  }
}

function useGdprExportFlow() {
  const [gdprEmail, setGdprEmail] = useState("")
  const [gdprExporting, setGdprExporting] = useState(false)
  const [gdprError, setGdprError] = useState<string | null>(null)

  async function exportGdprData() {
    const email = gdprEmail.trim().toLowerCase()
    if (!email) return
    setGdprExporting(true)
    setGdprError(null)
    try {
      const { blob, filename } = await fetchCustomerGdprExport(email)
      downloadBlob(blob, filename)
    } catch (err) {
      setGdprError(err instanceof Error && err.message !== "Failed" ? err.message : "Failed to export. Check the email address and try again.")
    } finally {
      setGdprExporting(false)
    }
  }

  return {
    exportGdprData,
    gdprEmail,
    gdprError,
    gdprExporting,
    setGdprEmail,
  }
}

function useClearTicketsFlow() {
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  async function clearTickets() {
    setClearing(true)
    setClearError(null)
    try {
      await clearWorkspaceTicketsRequest()
      setConfirmClear(false)
      setClearSuccess(true)
      setTimeout(() => setClearSuccess(false), 3000)
    } catch {
      setClearError("Failed to clear tickets. Please try again.")
    } finally {
      setClearing(false)
    }
  }

  return {
    clearError,
    clearSuccess,
    clearTickets,
    clearing,
    confirmClear,
    setConfirmClear,
  }
}

function useDeleteWorkspaceFlow({
  nextOrgId,
  orgName,
  setActive,
}: {
  nextOrgId: string | null
  orgName: string
  setActive: SetActive
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function deleteWorkspace() {
    if (deleteConfirmName !== orgName || !nextOrgId || !setActive) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteWorkspaceRequest(deleteConfirmName)
      await setActive({ organization: nextOrgId })
      window.location.assign("/dashboard")
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete workspace.")
      setDeleting(false)
    }
  }

  return {
    deleteConfirmName,
    deleteError,
    deleteOpen,
    deleteWorkspace,
    deleting,
    setDeleteConfirmName,
    setDeleteError,
    setDeleteOpen,
  }
}

export function useWorkspaceTabState(props: WorkspaceTabProps) {
  const { orgName } = props
  const { organization, membership } = useOrganization()
  const { setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  })
  const isAdmin = membership?.role === "org:admin"
  const nextOrgId = userMemberships?.data?.find(m => m.organization.id !== organization?.id)?.organization.id ?? null
  const isOnlyWorkspace = userMemberships?.data !== undefined && nextOrgId === null

  return {
    ...useClearTicketsFlow(),
    ...useDeleteWorkspaceFlow({ nextOrgId, orgName, setActive }),
    ...useGdprExportFlow(),
    ...useWorkspaceExportFlow(),
    isAdmin,
    isOnlyWorkspace,
  }
}

export type WorkspaceTabState = ReturnType<typeof useWorkspaceTabState>
