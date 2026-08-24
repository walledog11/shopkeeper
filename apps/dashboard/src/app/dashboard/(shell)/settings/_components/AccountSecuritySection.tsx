"use client"

import { useSession, useUser } from "@clerk/nextjs"
import { ChevronLeft, Eye, EyeOff, Loader2, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import {
  GLASS_SETTINGS_ACTION,
  GLASS_SETTINGS_ACTION_DANGER,
  SOLID_SETTINGS_TILE,
} from "@/lib/ui/glass-card-styles"
import { cn } from "@/lib/ui/cn"
import {
  clerkErrorMessage,
  formatSessionActivity,
  passwordStatusLabel,
  passwordUpdateError,
} from "./account-settings-helpers"
import { SettingsTile, settingsFieldClassName } from "./SettingsTile"

const passwordFieldClassName =
  "h-11 rounded-xl border border-stone-900/12 bg-[#f6f2eb] text-[#2b2118] shadow-none placeholder:text-stone-400 focus-visible:border-[#2b2118]/25 focus-visible:ring-2 focus-visible:ring-[#2b2118]/8"

type RemoteSession = {
  id: string
  latestActivity?: {
    browserName?: string
    deviceType?: string
    city?: string
    country?: string
  }
  revoke: () => Promise<unknown>
}

export function AccountSecuritySection({
  editorOpen,
  onEditorOpenChange,
}: {
  editorOpen: boolean
  onEditorOpenChange: (open: boolean) => void
}) {
  const { user } = useUser()
  const { session } = useSession()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sessions, setSessions] = useState<RemoteSession[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void user
      .getSessions()
      .then((items) => {
        if (!cancelled) setSessions(items)
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
      .finally(() => {
        if (!cancelled) setSessionsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const otherSessions = useMemo(
    () => sessions.filter((item) => item.id !== session?.id),
    [session?.id, sessions],
  )
  const currentRemoteSession = useMemo(
    () => sessions.find((item) => item.id === session?.id),
    [session?.id, sessions],
  )

  if (!user) return null

  if (editorOpen) {
    return (
      <PasswordEditor
        passwordEnabled={user.passwordEnabled}
        onClose={() => onEditorOpenChange(false)}
        onSubmit={async (values) => {
          await user.updatePassword({
            newPassword: values.newPassword,
            ...(user.passwordEnabled ? { currentPassword: values.currentPassword } : {}),
            signOutOfOtherSessions: values.signOutOfOtherSessions,
          })
        }}
      />
    )
  }

  return (
    <div id="security" className="flex flex-col gap-4 scroll-mt-6">
      <SettingsTile
        label="Password"
        action={
          <Button
            type="button"
            variant="outline"
            className={GLASS_SETTINGS_ACTION}
            onClick={() => onEditorOpenChange(true)}
          >
            {user.passwordEnabled ? "Update password" : "Set password"}
          </Button>
        }
      >
        {passwordStatusLabel(user.passwordEnabled)}
      </SettingsTile>

      <SettingsTile label="Two-factor authentication">
        {user.twoFactorEnabled ? "On" : "Off"}
      </SettingsTile>

      <SettingsTile
        label="Active devices"
        action={
          otherSessions.length > 0 ? (
            <SignOutOthersButton
              sessions={otherSessions}
              onRevoked={(revokedIds) => {
                setSessions((current) => current.filter((item) => !revokedIds.includes(item.id)))
              }}
            />
          ) : null
        }
      >
        {!sessionsLoaded ? (
          "Loading devices…"
        ) : (
          <ul className="space-y-1.5">
            <li>
              <span className="font-medium text-strong">This device</span>
              {currentRemoteSession ? (
                <span className="text-faint"> · {formatSessionActivity(currentRemoteSession)}</span>
              ) : null}
            </li>
            {otherSessions.map((item) => (
              <li key={item.id}>{formatSessionActivity(item)}</li>
            ))}
          </ul>
        )}
      </SettingsTile>

      <SettingsTile
        label="Delete account"
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            className={GLASS_SETTINGS_ACTION_DANGER}
          >
            <Trash2 className="size-4" />
            Delete account
          </Button>
        }
      >
        Permanently delete your Shopkeeper account and sign out of every workspace.
      </SettingsTile>

      <DeleteAccountDialog
        confirmValue={user.primaryEmailAddress?.emailAddress ?? user.id}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDelete={async () => {
          await user.delete()
          window.location.assign("/login")
        }}
      />
    </div>
  )
}

function SignOutOthersButton({
  sessions,
  onRevoked,
}: {
  sessions: RemoteSession[]
  onRevoked: (ids: string[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex w-full flex-col items-stretch gap-1 sm:items-start">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        className={GLASS_SETTINGS_ACTION}
        onClick={() => {
          setBusy(true)
          setError(null)
          void Promise.all(sessions.map((item) => item.revoke()))
            .then(() => {
              onRevoked(sessions.map((item) => item.id))
            })
            .catch((caught) => {
              setError(clerkErrorMessage(caught, "Could not sign out other devices."))
            })
            .finally(() => setBusy(false))
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Sign out {sessions.length} other {sessions.length === 1 ? "device" : "devices"}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

function PasswordEditor({
  passwordEnabled,
  onClose,
  onSubmit,
}: {
  passwordEnabled: boolean
  onClose: () => void
  onSubmit: (values: {
    currentPassword: string
    newPassword: string
    signOutOfOtherSessions: boolean
  }) => Promise<void>
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [signOutOfOtherSessions, setSignOutOfOtherSessions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = passwordUpdateError({
    confirmPassword,
    currentPassword,
    newPassword,
    passwordEnabled,
  }) === null

  return (
    <div className={SOLID_SETTINGS_TILE}>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-strong"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      <div className="mt-4 max-w-md space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-strong">
          {passwordEnabled ? "Update password" : "Set password"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Use at least 8 characters. You will stay signed in on this device.
        </p>
      </div>
      <form
        className="mt-6 max-w-md space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          const nextError = passwordUpdateError({
            confirmPassword,
            currentPassword,
            newPassword,
            passwordEnabled,
          })
          if (nextError) {
            setError(nextError)
            return
          }
          setBusy(true)
          setError(null)
          void onSubmit({ currentPassword, newPassword, signOutOfOtherSessions })
            .then(onClose)
            .catch((caught) => {
              setError(clerkErrorMessage(caught, "Could not update password."))
            })
            .finally(() => setBusy(false))
        }}
      >
        {passwordEnabled ? (
          <PasswordField
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            disabled={busy}
          />
        ) : null}
        <PasswordField
          id="new-password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          disabled={busy}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-4 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-strong">Sign out of other devices</p>
            <p className="text-xs text-muted-foreground">
              Keep this session and end every other signed-in device.
            </p>
          </div>
          <Switch
            checked={signOutOfOtherSessions}
            onChange={setSignOutOfOtherSessions}
            disabled={busy}
            ariaLabel="Sign out of other devices"
          />
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="border-foreground/[0.12] text-strong hover:bg-foreground/[0.06]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !canSubmit}
            className="bg-[#2b2118] text-[#f6f2eb] hover:bg-[#1a120c]"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save password"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function PasswordField({
  autoComplete,
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  autoComplete: string
  disabled: boolean
  id: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={cn(passwordFieldClassName, "pr-11")}
        />
        <button
          type="button"
          onClick={() => setVisible((open) => !open)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-strong"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </label>
  )
}

function DeleteAccountDialog({
  confirmValue,
  open,
  onOpenChange,
  onDelete,
}: {
  confirmValue: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => Promise<void>
}) {
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
        if (!next) {
          setTyped("")
          setError(null)
        }
      }}
    >
      <DialogContent className="border-foreground/10">
        <DialogHeader>
          <DialogTitle className="text-foreground">Delete account?</DialogTitle>
          <DialogDescription>
            This permanently removes your profile, email addresses, and access to every
            workspace. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-muted-foreground">
            Type <span className="font-mono text-strong">{confirmValue}</span> to confirm
          </span>
          <Input
            aria-label="Confirm account email"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={confirmValue}
            disabled={busy}
            className={settingsFieldClassName}
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="border-foreground/[0.12] text-strong hover:bg-foreground/[0.06]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || typed !== confirmValue}
            onClick={() => {
              setBusy(true)
              setError(null)
              void onDelete()
                .catch((caught) => {
                  setError(clerkErrorMessage(caught, "Could not delete account."))
                  setBusy(false)
                })
            }}
            className="bg-red-600 text-[#ffffff] hover:bg-red-700"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
