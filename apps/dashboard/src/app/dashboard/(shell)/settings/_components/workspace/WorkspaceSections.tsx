import { Download, Loader2, Trash2 } from "lucide-react"
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
import { SettingsDisclosure } from "@/components/settings-form/shared"
import type { WorkspaceTabProps, WorkspaceTabState } from "./useWorkspaceTabState"

interface WorkspaceTabViewProps extends WorkspaceTabProps {
  state: WorkspaceTabState
}

export function WorkspaceTabView({ orgName, state }: WorkspaceTabViewProps) {
  return (
    <div className="space-y-6">
      <DataPrivacySection state={state} />
      <DangerZone orgName={orgName} state={state} />
      <DeleteWorkspaceDialog orgName={orgName} state={state} />
    </div>
  )
}

function DataExportSection({ state }: { state: WorkspaceTabState }) {
  const {
    exportData,
    exportError,
    exporting,
  } = state

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-strong">Data export</h3>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-faint">
          Download a JSON snapshot of all customers, tickets, messages, and memory.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <p className="text-xs text-faint max-w-md">
          Useful for backups or migrating off Shopkeeper. Doesn&apos;t include integration tokens, billing data, or audit logs.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {exportError && <p className="text-xs text-red-400">{exportError}</p>}
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={exporting}
            className="h-8 text-xs font-semibold border-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.08]"
          >
            {exporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            Export JSON
          </Button>
        </div>
      </div>
    </div>
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
    <div className="space-y-3 border-t border-foreground/[0.06] pt-5">
      <div>
        <h3 className="text-sm font-semibold text-strong">Customer data export</h3>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-faint">
          Download all support tickets and profile data for one customer as JSON.
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            aria-label="Customer email for data export"
            type="email"
            value={gdprEmail}
            onChange={e => setGdprEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && exportGdprData()}
            placeholder="customer@example.com"
            className="h-9 flex-1 min-w-48 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-strong placeholder:text-faint"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={exportGdprData}
            disabled={gdprExporting || !gdprEmail.trim()}
            className="h-8 text-xs font-semibold border-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.08] shrink-0"
          >
            {gdprExporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            Export data
          </Button>
        </div>
        {gdprError && <p className="text-xs text-red-400">{gdprError}</p>}
        <p className="text-xs text-faint">
          Message data is retained for 90 days, then archived. Archived threads are purged after another 90 days.
        </p>
      </div>
    </div>
  )
}

function DataPrivacySection({ state }: { state: WorkspaceTabState }) {
  return (
    <SettingsDisclosure
      title="Data & privacy"
      description="Exports for backups, GDPR requests, and compliance."
    >
      <DataExportSection state={state} />
      <GdprExportSection state={state} />
    </SettingsDisclosure>
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
        <p className="text-xs text-faint mt-0.5">These actions are permanent and cannot be undone.</p>
      </div>
      <div className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-sm font-semibold text-strong">Clear all ticket history</p>
            <p className="text-xs text-faint mt-0.5">Permanently deletes all threads and messages for this workspace. This affects every member of the workspace.</p>
            {clearError && <p className="text-xs text-red-400 mt-1">{clearError}</p>}
            {clearSuccess && <p className="text-xs text-green-400 mt-1">All ticket history has been cleared.</p>}
          </div>
          {confirmClear ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-faint">Are you sure?</span>
              <Button
                size="sm"
                onClick={clearTickets}
                disabled={clearing}
                className="h-7 px-3 bg-red-600 hover:bg-red-700 text-[#ffffff] text-xs font-semibold"
              >
                {clearing ? <Loader2 className="size-3 animate-spin" /> : "Yes, clear"}
              </Button>
              <button type="button"
                onClick={() => setConfirmClear(false)}
                className="text-xs text-faint hover:text-strong transition-colors"
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
              <p className="text-sm font-semibold text-strong">Delete workspace</p>
              <p className="text-xs text-faint mt-0.5">
                Permanently delete <span className="text-muted-foreground font-medium">{orgName}</span> and all of its data — tickets, customers, integrations, memory, and billing. Every member will lose access.
              </p>
              {isOnlyWorkspace && (
                <p className="text-xs text-amber-400/80 mt-1.5">
                  This is your only workspace. Create another workspace first, or use Profile &amp; security from the avatar menu to delete your account.
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
          <span className="block text-xs font-semibold text-muted-foreground">
            Type <span className="text-strong font-mono">{orgName}</span> to confirm
          </span>
          <Input
            aria-label="Confirm workspace name"
            autoFocus
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={orgName}
            disabled={deleting}
            className="h-9 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-strong placeholder:text-faint"
          />
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
            className="border-foreground/[0.12] text-strong hover:bg-foreground/[0.06]"
          >
            Cancel
          </Button>
          <Button
            onClick={deleteWorkspace}
            disabled={deleting || deleteConfirmName !== orgName}
            className="bg-red-600 hover:bg-red-700 text-[#ffffff]"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
