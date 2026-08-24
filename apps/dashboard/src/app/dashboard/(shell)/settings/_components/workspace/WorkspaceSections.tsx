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
import {
  GLASS_SETTINGS_ACTION,
  GLASS_SETTINGS_ACTION_DANGER,
} from "@/lib/ui/glass-card-styles"
import { SettingsTile, settingsFieldClassName } from "../SettingsTile"
import type { WorkspaceTabProps, WorkspaceTabState } from "./useWorkspaceTabState"

interface WorkspaceTabViewProps extends WorkspaceTabProps {
  state: WorkspaceTabState
}

export function WorkspaceTabView({ orgName, state }: WorkspaceTabViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <DataPrivacySection state={state} />
      {/* Both danger-zone actions are admin-only server-side, so members are not
          shown a section where every button would come back 403. */}
      {state.isAdmin ? <DangerZone orgName={orgName} state={state} /> : null}
      <ClearTicketsDialog state={state} />
      <DeleteWorkspaceDialog orgName={orgName} state={state} />
    </div>
  )
}

function DataPrivacySection({ state }: { state: WorkspaceTabState }) {
  return (
    <>
      <DataExportSection state={state} />
      <GdprExportSection state={state} />
    </>
  )
}

function DataExportSection({ state }: { state: WorkspaceTabState }) {
  const { exportData, exportError, exporting } = state

  return (
    <SettingsTile
      id="privacy"
      label="Data export"
      action={
        <div className="flex w-full flex-col items-stretch gap-1 sm:items-start">
          <Button
            type="button"
            variant="outline"
            onClick={exportData}
            disabled={exporting}
            className={GLASS_SETTINGS_ACTION}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export JSON
          </Button>
          {exportError ? <p className="text-xs text-red-600">{exportError}</p> : null}
        </div>
      }
    >
      Download a JSON snapshot of all customers, tickets, messages, and memory. Useful for backups
      or migrating off Shopkeeper. Doesn&apos;t include integration tokens, billing data, or audit logs.
    </SettingsTile>
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
    <SettingsTile
      label="Customer data export"
      action={
        <Button
          type="button"
          variant="outline"
          onClick={exportGdprData}
          disabled={gdprExporting || !gdprEmail.trim()}
          className={GLASS_SETTINGS_ACTION}
        >
          {gdprExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export data
        </Button>
      }
    >
      <div className="space-y-3">
        <p>Download all support tickets and profile data for one customer as JSON.</p>
        <Input
          aria-label="Customer email for data export"
          type="email"
          value={gdprEmail}
          onChange={(event) => setGdprEmail(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && exportGdprData()}
          placeholder="customer@example.com"
          className={settingsFieldClassName}
        />
        {gdprError ? <p className="text-xs text-red-600">{gdprError}</p> : null}
        <p className="text-xs">
          Message data is retained for 90 days, then archived. Archived threads are purged after another 90 days.
        </p>
      </div>
    </SettingsTile>
  )
}

function DangerZone({ orgName, state }: { orgName: string; state: WorkspaceTabState }) {
  const {
    clearError,
    clearSuccess,
    isOnlyWorkspace,
    setConfirmClear,
    setDeleteConfirmName,
    setDeleteError,
    setDeleteOpen,
  } = state

  return (
    <>
      <SettingsTile
        id="danger"
        label="Clear all ticket history"
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmClear(true)}
            className={GLASS_SETTINGS_ACTION_DANGER}
          >
            Clear history
          </Button>
        }
      >
        <div className="space-y-1.5">
          <p>Permanently deletes all threads and messages for this workspace. This affects every member of the workspace.</p>
          {clearError ? <p className="text-xs text-red-600">{clearError}</p> : null}
          {clearSuccess ? <p className="text-xs text-green-600">All ticket history has been cleared.</p> : null}
        </div>
      </SettingsTile>

      <SettingsTile
        label="Delete workspace"
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDeleteConfirmName("")
              setDeleteError(null)
              setDeleteOpen(true)
            }}
            disabled={isOnlyWorkspace}
            className={GLASS_SETTINGS_ACTION_DANGER}
          >
            <Trash2 className="size-4" />
            Delete workspace
          </Button>
        }
      >
        <div className="space-y-1.5">
          <p>
            Permanently delete <span className="font-medium text-strong">{orgName}</span> and all of its
            data — tickets, customers, integrations, memory, and billing. Every member will lose access.
          </p>
          {isOnlyWorkspace ? (
            <p className="text-xs text-amber-600/80">
              This is your only workspace. Create another workspace first, or delete your account from{" "}
              <a href="/dashboard/account" className="font-semibold text-muted-foreground hover:text-strong">
                account settings
              </a>
              .
            </p>
          ) : null}
        </div>
      </SettingsTile>
    </>
  )
}

function ClearTicketsDialog({ state }: { state: WorkspaceTabState }) {
  const {
    clearTickets,
    clearing,
    confirmClear,
    setConfirmClear,
  } = state

  return (
    <Dialog
      open={confirmClear}
      onOpenChange={(open) => {
        if (clearing) return
        setConfirmClear(open)
      }}
    >
      <DialogContent className="border-foreground/10">
        <DialogHeader>
          <DialogTitle className="text-foreground">Clear all ticket history?</DialogTitle>
          <DialogDescription>
            Permanently deletes all threads and messages for this workspace. This affects every
            member of the workspace. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmClear(false)}
            disabled={clearing}
            className="border-foreground/[0.12] text-strong hover:bg-foreground/[0.06]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={clearTickets}
            disabled={clearing}
            className="bg-red-600 text-[#ffffff] hover:bg-red-700"
          >
            {clearing ? <Loader2 className="size-4 animate-spin" /> : "Clear history"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <DialogTitle className="text-foreground">Delete {orgName}?</DialogTitle>
          <DialogDescription>
            This permanently removes the workspace, all tickets, customers, integrations, and memory. Any active subscription will be cancelled. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-muted-foreground">
            Type <span className="font-mono text-strong">{orgName}</span> to confirm
          </span>
          <Input
            aria-label="Confirm workspace name"
            autoFocus
            value={deleteConfirmName}
            onChange={(event) => setDeleteConfirmName(event.target.value)}
            placeholder={orgName}
            disabled={deleting}
            className={settingsFieldClassName}
          />
          {deleteError ? <p className="text-xs text-red-600">{deleteError}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
            className="border-foreground/[0.12] text-strong hover:bg-foreground/[0.06]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={deleteWorkspace}
            disabled={deleting || deleteConfirmName !== orgName}
            className="bg-red-600 text-[#ffffff] hover:bg-red-700"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
