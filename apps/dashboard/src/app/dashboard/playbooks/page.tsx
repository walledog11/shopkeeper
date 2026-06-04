"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus } from "lucide-react"
import { errorMessageFromUnknown, fetcher } from "@/lib/api/fetcher"
import type { Playbook } from "@/types"
import { EmptyState } from "./_components/EmptyState"
import { PlaybookCard } from "./_components/PlaybookCard"
import { PlaybookDrawer } from "./_components/PlaybookDrawer"
import { TemplatesModal } from "./_components/TemplatesModal"
import type { PlaybookTemplate } from "./_components/playbook-helpers"
import { deletePlaybook, togglePlaybook } from "./_components/playbook-requests"

function templateToDraft(template: PlaybookTemplate): Playbook {
  return {
    ...template,
    id: "",
    organizationId: "",
    enabled: true,
    createdAt: "",
    updatedAt: "",
  } as Playbook
}

export default function PlaybooksPage() {
  const { data, isLoading, mutate } = useSWR<{ playbooks: Playbook[] }>("/api/playbooks", fetcher, { revalidateOnFocus: false })
  const playbooks = data?.playbooks ?? []

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [templateDraft, setTemplateDraft] = useState<PlaybookTemplate | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const openNew = () => {
    setActionError(null)
    setEditing(null)
    setTemplateDraft(null)
    setDrawerOpen(true)
  }

  const openEdit = (playbook: Playbook) => {
    setActionError(null)
    setEditing(playbook)
    setTemplateDraft(null)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditing(null)
    setTemplateDraft(null)
  }

  const handleUseTemplate = (template: PlaybookTemplate) => {
    setEditing(null)
    setTemplateDraft(template)
    setDrawerOpen(true)
  }

  const handleToggle = async (playbook: Playbook) => {
    setActionError(null)
    try {
      const updated = await togglePlaybook(playbook.id, !playbook.enabled)
      await updateCachedPlaybook(updated)
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, "Failed to update playbook."))
    }
  }

  const handleDelete = async (id: string) => {
    setActionError(null)
    try {
      await deletePlaybook(id)
      await mutate(
        current => ({
          playbooks: (current?.playbooks ?? []).filter(playbook => playbook.id !== id),
        }),
        false,
      )
    } catch (error) {
      setActionError(errorMessageFromUnknown(error, "Failed to delete playbook."))
    }
  }

  const updateCachedPlaybook = (updated: Playbook) => {
    return mutate(
      current => {
        const currentPlaybooks = current?.playbooks ?? []
        const exists = currentPlaybooks.some(playbook => playbook.id === updated.id)
        return {
          playbooks: exists
            ? currentPlaybooks.map(playbook => playbook.id === updated.id ? updated : playbook)
            : [...currentPlaybooks, updated],
        }
      },
      false,
    )
  }

  const active = playbooks.filter(playbook => playbook.enabled)
  const paused = playbooks.filter(playbook => !playbook.enabled)

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Playbooks</h1>
          <p className="text-sm text-white/40">Trigger-based rules that run automatically. Combine tags, replies, and closures.</p>
        </div>
        <div className="flex md:flex-row flex-col items-center gap-3 shrink-0">
          <button type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 text-sm font-semibold text-white border border-green-500 bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded-md transition-colors"
          >
            <Plus className="size-4" />
            New playbook
          </button>
          <button type="button"
            onClick={() => setTemplatesOpen(true)}
            className="text-sm text-white/50 hover:text-white/80 border border-white/40 font-semibold px-4 py-1.5 gap-1.5 bg-white/10 rounded-md transition-colors"
          >
            Browse templates
          </button>
        </div>
      </div>

      {actionError && (
        <p className="mb-4 text-xs text-red-400" aria-live="polite">{actionError}</p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {["playbook-skeleton-1", "playbook-skeleton-2"].map(key => (
            <div key={key} className="h-20 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        <EmptyState onUseTemplate={handleUseTemplate} />
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
                Active · {active.length}
              </p>
              <div className="space-y-2">
                {active.map(playbook => (
                  <PlaybookCard
                    key={playbook.id}
                    playbook={playbook}
                    onToggle={() => handleToggle(playbook)}
                    onEdit={() => openEdit(playbook)}
                    onDelete={() => handleDelete(playbook.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {paused.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
                Paused · {paused.length}
              </p>
              <div className="space-y-2">
                {paused.map(playbook => (
                  <PlaybookCard
                    key={playbook.id}
                    playbook={playbook}
                    onToggle={() => handleToggle(playbook)}
                    onEdit={() => openEdit(playbook)}
                    onDelete={() => handleDelete(playbook.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {templatesOpen && (
        <TemplatesModal
          onSelect={handleUseTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {drawerOpen && (
        <PlaybookDrawer
          initial={editing ?? (templateDraft ? templateToDraft(templateDraft) : null)}
          onClose={closeDrawer}
          onSave={updateCachedPlaybook}
        />
      )}
    </div>
  )
}
