"use client"

import { useRef, useState } from "react"
import { useOrganization, useOrganizationList } from "@clerk/nextjs"
import {
  clearWorkspaceTicketsRequest,
  deleteWorkspaceRequest,
  downloadBlob,
  fetchWorkspaceExport,
  logoValidationError,
  saveWorkspaceName,
} from "./workspace-requests"

export interface WorkspaceTabProps {
  orgName: string
  version: string
}

type Organization = ReturnType<typeof useOrganization>["organization"]
type SetActive = ReturnType<typeof useOrganizationList>["setActive"]

function useWorkspaceSaveFlow({ orgName, version }: WorkspaceTabProps) {
  const [workspaceName, setWorkspaceName] = useState(orgName)
  const currentVersionRef = useRef(version)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await saveWorkspaceName({
        name: workspaceName,
        version: currentVersionRef.current,
      })

      if (result.status === "conflict") {
        if (result.current?.name) setWorkspaceName(result.current.name)
        if (result.current?.version) currentVersionRef.current = result.current.version
        setError("Workspace was updated in another tab. The latest name has been loaded.")
        return
      }

      if (result.version) currentVersionRef.current = result.version
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return {
    error,
    save,
    saved,
    saving,
    setWorkspaceName,
    workspaceName,
  }
}

function useWorkspaceLogoFlow(organization: Organization) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  async function uploadLogo(file: File) {
    if (!organization) return

    const validationError = logoValidationError(file)
    if (validationError) {
      setLogoError(validationError)
      return
    }

    setLogoBusy(true)
    setLogoError(null)
    try {
      await organization.setLogo({ file })
    } catch {
      setLogoError("Failed to upload. Please try again.")
    } finally {
      setLogoBusy(false)
    }
  }

  async function removeLogo() {
    if (!organization) return
    setLogoBusy(true)
    setLogoError(null)
    try {
      await organization.setLogo({ file: null })
    } catch {
      setLogoError("Failed to remove. Please try again.")
    } finally {
      setLogoBusy(false)
    }
  }

  return {
    fileInputRef,
    logoBusy,
    logoError,
    removeLogo,
    uploadLogo,
  }
}

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
    ...useWorkspaceExportFlow(),
    ...useWorkspaceLogoFlow(organization),
    ...useWorkspaceSaveFlow(props),
    isAdmin,
    isOnlyWorkspace,
    organization,
  }
}

export type WorkspaceTabState = ReturnType<typeof useWorkspaceTabState>
