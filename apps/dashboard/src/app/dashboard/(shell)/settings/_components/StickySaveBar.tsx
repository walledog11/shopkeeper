"use client"

import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AgentTabController } from "./useAgentTabState"

export function StickySaveBar({ controller }: { controller: AgentTabController }) {
  const { isDirty, saved, error, staleVersion, saving, businessHoursInvalid, reset, save } = controller

  if (!isDirty && !saved && !error && !staleVersion) return null

  return (
    <div className="sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-3 pb-4 z-10">
      <div className="rounded-md border border-foreground/[0.10] bg-[#0c0c0c]/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.5)] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {staleVersion ? (
            <p className="text-xs text-amber-300 truncate">Settings were updated in another tab. Reset to load the latest, then reapply your changes.</p>
          ) : error ? (
            <p className="text-xs text-red-400 truncate">{error}</p>
          ) : saved && !isDirty ? (
            <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
              <Check className="size-3.5" /> Saved
            </p>
          ) : (
            <>
              <span className="size-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
              <p className="text-xs text-foreground/70">Unsaved changes</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={reset}
            disabled={saving || (!isDirty && !staleVersion)}
            className="text-xs font-semibold text-foreground/50 hover:text-foreground/80 disabled:opacity-30 disabled:hover:text-foreground/50 transition-colors px-2 py-1.5"
          >
            Reset
          </button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !isDirty || businessHoursInvalid}
            className="h-8 px-4 bg-amber-400 text-black hover:bg-amber-300 text-xs font-semibold disabled:opacity-40 min-w-[90px]"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
