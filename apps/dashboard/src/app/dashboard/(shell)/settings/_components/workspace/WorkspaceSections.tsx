import Link from "next/link"
import { Download, Loader2, Trash2, Upload } from "lucide-react"
import { OrgAvatar } from "@/components/OrgAvatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SaveButton, SectionCard } from "../shared"
import type { WorkspaceTabProps, WorkspaceTabState } from "./useWorkspaceTabState"

interface WorkspaceTabViewProps extends WorkspaceTabProps {
  state: WorkspaceTabState
}

export function WorkspaceTabView({ orgName, state }: WorkspaceTabViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-foreground/80">Workspace</h1>
        <p className="text-sm text-foreground/35 mt-0.5">Manage your workspace settings.</p>
      </div>

      <GeneralSection orgName={orgName} state={state} />
      <BrandingSection orgName={orgName} state={state} />
      <DataExportSection state={state} />
      <GdprExportSection state={state} />
      <DangerZone orgName={orgName} state={state} />
      <DeleteWorkspaceDialog orgName={orgName} state={state} />
    </div>
  )
}

function GeneralSection({ orgName, state }: { orgName: string; state: WorkspaceTabState }) {
  const {
    error,
    save,
    saved,
    saving,
    setWorkspaceName,
    workspaceName,
  } = state

  return (
    <SectionCard title="General" description="How your workspace is identified across the dashboard.">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-foreground/60">Workspace name</span>
          <Input
            aria-label="Workspace name"
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            placeholder="My Store"
            className="h-9 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-foreground/80 placeholder:text-foreground/25"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <SaveButton
            saving={saving}
            saved={saved}
            onClick={save}
            disabled={!workspaceName.trim() || workspaceName === orgName}
          />
        </div>
      </div>
    </SectionCard>
  )
}

function BrandingSection({ orgName, state }: { orgName: string; state: WorkspaceTabState }) {
  const {
    fileInputRef,
    logoBusy,
    logoError,
    organization,
    removeLogo,
    uploadLogo,
  } = state

  return (
    <SectionCard title="Branding" description="Logo shown in the sidebar and the org switcher.">
      <div className="flex items-center gap-4">
        <OrgAvatar
          name={organization?.name ?? orgName}
          imageUrl={organization?.imageUrl}
          className="size-14 rounded-md bg-foreground/[0.06] border border-foreground/[0.10] text-foreground/60 font-semibold text-sm shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Workspace logo"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void uploadLogo(file)
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoBusy || !organization}
              className="h-8 text-xs font-semibold border-foreground/[0.10] text-foreground/60 hover:bg-foreground/[0.08]"
            >
              {logoBusy ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
              {organization?.imageUrl ? "Replace" : "Upload"}
            </Button>
            {organization?.imageUrl && (
              <button type="button"
                onClick={removeLogo}
                disabled={logoBusy}
                className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-40"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-foreground/30 mt-1.5">PNG, JPG, or SVG. Up to 2MB.</p>
          {logoError && <p className="text-xs text-red-400 mt-1">{logoError}</p>}
        </div>
      </div>
    </SectionCard>
  )
}

function DataExportSection({ state }: { state: WorkspaceTabState }) {
  const {
    exportData,
    exportError,
    exporting,
  } = state

  return (
    <SectionCard title="Data export" description="Download a JSON snapshot of all customers, tickets, messages, and memory.">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <p className="text-xs text-foreground/35 max-w-md">
          Useful for backups or migrating off Shopkeeper. Doesn&apos;t include integration tokens, billing data, or audit logs.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {exportError && <p className="text-xs text-red-400">{exportError}</p>}
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={exporting}
            className="h-8 text-xs font-semibold border-foreground/[0.10] text-foreground/60 hover:bg-foreground/[0.08]"
          >
            {exporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            Export JSON
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}

function GdprExportSection({ state }: { state: WorkspaceTabState }) {
  const {
    exportGdprData,
    gdprEmail,
    gdprError,
    gdprExporting,
    setGdprEmail,
  } = state

  return (
    <SectionCard title="Customer data export" description="Download all support tickets and profile data for one customer as JSON. Use this to answer data access requests under GDPR (Art. 15) or CCPA.">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            aria-label="Customer email for data export"
            type="email"
            value={gdprEmail}
            onChange={e => setGdprEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && exportGdprData()}
            placeholder="customer@example.com"
            className="h-9 flex-1 min-w-48 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-foreground/80 placeholder:text-foreground/25"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={exportGdprData}
            disabled={gdprExporting || !gdprEmail.trim()}
            className="h-8 text-xs font-semibold border-foreground/[0.10] text-foreground/60 hover:bg-foreground/[0.08] shrink-0"
          >
            {gdprExporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            Export data
          </Button>
        </div>
        {gdprError && <p className="text-xs text-red-400">{gdprError}</p>}
        <p className="text-xs text-foreground/30">
          Message data is retained for 90 days, then archived. Archived threads are purged after another 90 days.
        </p>
      </div>
    </SectionCard>
  )
}

function DangerZone({ orgName, state }: { orgName: string; state: WorkspaceTabState }) {
  const {
    clearError,
    clearSuccess,
    clearTickets,
    clearing,
    confirmClear,
    isAdmin,
    isOnlyWorkspace,
    setConfirmClear,
    setDeleteConfirmName,
    setDeleteError,
    setDeleteOpen,
  } = state

  return (
    <div className="rounded-md border border-red-500/20 overflow-hidden">
      <div className="px-6 py-4 bg-red-500/[0.06] border-b border-red-500/15">
        <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
        <p className="text-xs text-foreground/35 mt-0.5">These actions are permanent and cannot be undone.</p>
      </div>
      <div className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground/70">Clear all ticket history</p>
            <p className="text-xs text-foreground/35 mt-0.5">Permanently deletes all threads and messages for this workspace. This affects every member of the workspace.</p>
            {clearError && <p className="text-xs text-red-400 mt-1">{clearError}</p>}
            {clearSuccess && <p className="text-xs text-green-400 mt-1">All ticket history has been cleared.</p>}
          </div>
          {confirmClear ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-foreground/35">Are you sure?</span>
              <Button
                size="sm"
                onClick={clearTickets}
                disabled={clearing}
                className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {clearing ? <Loader2 className="size-3 animate-spin" /> : "Yes, clear"}
              </Button>
              <button type="button"
                onClick={() => setConfirmClear(false)}
                className="text-xs text-foreground/30 hover:text-foreground/70 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
              className="h-7 px-3 text-xs font-semibold text-red-400 border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/[0.12] hover:text-red-300 self-start shrink-0"
            >
              Clear history
            </Button>
          )}
        </div>

        {isAdmin && (
          <div className="pt-5 border-t border-red-500/15 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground/70">Delete workspace</p>
              <p className="text-xs text-foreground/35 mt-0.5">
                Permanently delete <span className="text-foreground/60 font-medium">{orgName}</span> and all of its data — tickets, customers, integrations, memory, and billing. Every member will lose access.
              </p>
              {isOnlyWorkspace && (
                <p className="text-xs text-amber-400/80 mt-1.5">
                  This is your only workspace. Create another workspace first, or delete your account from{" "}
                  <Link href="/dashboard/account" className="font-semibold text-foreground/55 hover:text-foreground/75">
                    Account settings
                  </Link>{" "}
                  to leave Shopkeeper.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteConfirmName("")
                setDeleteError(null)
                setDeleteOpen(true)
              }}
              disabled={isOnlyWorkspace}
              className="h-7 px-3 text-xs font-semibold text-red-400 border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/[0.12] hover:text-red-300 self-start shrink-0"
            >
              <Trash2 className="size-3" />
              Delete workspace
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function DeleteWorkspaceDialog({ orgName, state }: { orgName: string; state: WorkspaceTabState }) {
  const {
    deleteConfirmName,
    deleteError,
    deleteOpen,
    deleteWorkspace,
    deleting,
    setDeleteConfirmName,
    setDeleteError,
    setDeleteOpen,
  } = state

  return (
    <Dialog
      open={deleteOpen}
      onOpenChange={(open) => {
        if (deleting) return
        setDeleteOpen(open)
        if (!open) {
          setDeleteConfirmName("")
          setDeleteError(null)
        }
      }}
    >
      <DialogContent className="border-foreground/10">
        <DialogHeader>
          <DialogTitle className="text-white">Delete {orgName}?</DialogTitle>
          <DialogDescription>
            This permanently removes the workspace, all tickets, customers, integrations, and memory. Any active subscription will be cancelled. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground/60">
            Type <span className="text-foreground/85 font-mono">{orgName}</span> to confirm
          </span>
          <Input
            aria-label="Confirm workspace name"
            autoFocus
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={orgName}
            disabled={deleting}
            className="h-9 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-foreground/85 placeholder:text-foreground/25"
          />
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
            className="border-foreground/[0.12] text-foreground/70 hover:bg-foreground/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={deleteWorkspace}
            disabled={deleting || deleteConfirmName !== orgName}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
