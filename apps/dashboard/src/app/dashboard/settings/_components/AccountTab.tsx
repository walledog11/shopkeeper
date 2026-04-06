"use client"

import { useState } from "react"
import { useClerk, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export default function AccountTab() {
  const { openUserProfile } = useClerk()
  const { user } = useUser()
  const userName = user?.fullName ?? user?.firstName ?? ""
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? ""
  const userImageUrl = user?.imageUrl ?? null
  const initials = userName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)

  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)

  async function clearTickets() {
    setClearing(true)
    setClearError(null)
    try {
      const res = await fetch('/api/org/data?action=clear_tickets', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setConfirmClear(false)
      setClearSuccess(true)
      setTimeout(() => setClearSuccess(false), 3000)
    } catch {
      setClearError('Failed to clear tickets. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Account</h1>
        <p className="text-sm text-white/35 mt-0.5">Manage your personal account settings.</p>
      </div>

      <div className="bg-card rounded-md border border-border overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-white/75">Profile</h2>
            <p className="text-xs text-white/35 mt-1 leading-relaxed">Your personal account. Name, email, and password are managed by Clerk.</p>
          </div>
          <div className="flex items-center gap-4 p-4 bg-white/[0.04] rounded-md border border-white/[0.07]">
            <div className="w-10 h-10 rounded-full bg-white/[0.10] flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
              {userImageUrl ? (
                <img src={userImageUrl} alt={userName} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/80 truncate">{userName}</p>
              <p className="text-xs text-white/40 truncate">{userEmail}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUserProfile()}
              className="h-8 text-xs font-semibold border-white/[0.10] text-white/60 hover:bg-white/[0.08] shrink-0"
            >
              Edit profile
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-red-500/20 overflow-hidden">
        <div className="px-6 py-4 bg-red-500/[0.06] border-b border-red-500/15">
          <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
          <p className="text-xs text-white/35 mt-0.5">These actions are permanent and cannot be undone.</p>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-sm font-semibold text-white/70">Clear all ticket history</p>
              <p className="text-xs text-white/35 mt-0.5">Permanently deletes all threads and messages for this workspace.</p>
              {clearError && <p className="text-xs text-red-400 mt-1">{clearError}</p>}
              {clearSuccess && <p className="text-xs text-green-400 mt-1">All ticket history has been cleared.</p>}
            </div>
            {confirmClear ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-white/35">Are you sure?</span>
                <Button
                  size="sm"
                  onClick={clearTickets}
                  disabled={clearing}
                  className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, clear"}
                </Button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-xs text-white/30 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClear(true)}
                className="h-7 px-3 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 self-start shrink-0"
              >
                Clear history
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
