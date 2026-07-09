"use client"

import { Plus, Trash2 } from "lucide-react"
import { CharacterCountTextarea, LabeledTextInput } from "./settings-form-fields"
import { SectionCard } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

const SAMPLE_REPLY_CAP = 10
const SAMPLE_REPLY_BODY_MAX = 300

export function AgentSampleRepliesSection({
  controller,
  embedded = false,
}: {
  controller: AgentTabController
  embedded?: boolean
}) {
  const { settingsState, dispatch } = controller
  const sampleReplies = settingsState.sampleReplies ?? []

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-faint">Add a tag to apply a reply only to matching tickets. Leave blank to make it always eligible.</p>
        <p className="text-xs text-faint shrink-0">{sampleReplies.length} / {SAMPLE_REPLY_CAP}</p>
      </div>

      {sampleReplies.length === 0 && (
        <p className="text-xs text-muted-foreground">No sample replies yet. Add one to teach the agent your voice.</p>
      )}

      {sampleReplies.map((sample, idx) => (
        <div key={sample.id} className="rounded-md border border-foreground/[0.10] bg-foreground/[0.02] p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Example {idx + 1}</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "set", patch: { sampleReplies: sampleReplies.filter(reply => reply.id !== sample.id) } })}
              aria-label="Remove sample reply"
              className="text-faint hover:text-red-400 transition-colors p-1 -m-1"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <CharacterCountTextarea
            aria-label={`Sample reply ${idx + 1} body`}
            value={sample.body}
            onValueChange={value => dispatch({
              type: "set",
              patch: {
                sampleReplies: sampleReplies.map(reply => reply.id === sample.id ? { ...reply, body: value } : reply),
              },
            })}
            placeholder="e.g. Hey! Totally hear you on the wait — let me chase that down and get back to you with an update."
            maxLength={SAMPLE_REPLY_BODY_MAX}
            rows={2}
            wrapperClassName="space-y-1"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledTextInput
              label="When to use"
              hint="optional"
              aria-label={`Sample reply ${idx + 1} usage context`}
              value={sample.context ?? ""}
              onChange={e => dispatch({
                type: "set",
                patch: {
                  sampleReplies: sampleReplies.map(reply => reply.id === sample.id
                    ? { ...reply, context: e.target.value || undefined }
                    : reply),
                },
              })}
              placeholder="e.g. shipping delay"
              maxLength={80}
              inputClassName="h-8 text-xs"
            />
            <LabeledTextInput
              label="Tag"
              hint="match against ticket tag"
              aria-label={`Sample reply ${idx + 1} tag`}
              value={sample.tag ?? ""}
              onChange={e => dispatch({
                type: "set",
                patch: {
                  sampleReplies: sampleReplies.map(reply => reply.id === sample.id
                    ? { ...reply, tag: e.target.value || undefined }
                    : reply),
                },
              })}
              placeholder="e.g. shipping"
              maxLength={40}
              inputClassName="h-8 text-xs"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          if (sampleReplies.length >= SAMPLE_REPLY_CAP) return
          dispatch({ type: "set", patch: { sampleReplies: [...sampleReplies, { id: `sample-${sampleReplies.length + 1}`, body: "" }] } })
        }}
        disabled={sampleReplies.length >= SAMPLE_REPLY_CAP}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-foreground/[0.12] bg-foreground/[0.04] text-xs font-semibold text-strong hover:bg-foreground/[0.08] hover:text-strong hover:border-foreground/[0.22] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-foreground/[0.04] disabled:hover:text-strong disabled:hover:border-foreground/[0.12]"
      >
        <Plus className="size-3.5" />
        Add sample reply
      </button>
    </div>
  )

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-strong">Sample replies</h3>
          <p className="text-xs text-faint mt-0.5 leading-relaxed">
            Show the agent up to 10 example replies. It will match their style and tone in customer-facing messages.
          </p>
        </div>
        {content}
      </div>
    )
  }

  return (
    <SectionCard title="Sample replies" description="Show the agent up to 10 example replies. It will match their style and tone in customer-facing messages." variant="board">
      {content}
    </SectionCard>
  )
}
