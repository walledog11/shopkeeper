"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CharacterCountTextarea, LabeledTextInput } from "./settings-form-fields"
import { SolidSettingsTile as SettingsTile, settingsTextareaClassName } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import { GLASS_SETTINGS_ACTION } from "@/lib/ui/glass-card-styles"
import type { AgentTabController } from "./useAgentTabState"

const SAMPLE_REPLY_CAP = 10
const SAMPLE_REPLY_BODY_MAX = 300

export function AgentSampleRepliesSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller
  const sampleReplies = settingsState.sampleReplies ?? []

  return (
    <SettingsTile
      label="Sample replies"
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (sampleReplies.length >= SAMPLE_REPLY_CAP) return
            dispatch({ type: "set", patch: { sampleReplies: [...sampleReplies, { id: `sample-${sampleReplies.length + 1}`, body: "" }] } })
          }}
          disabled={sampleReplies.length >= SAMPLE_REPLY_CAP}
          className={GLASS_SETTINGS_ACTION}
        >
          <Plus className="size-4" />
          Add sample reply
        </Button>
      }
    >
      <div className="space-y-4">
        <p>
          Show the agent up to 10 example replies. It will match their style and tone in customer-facing messages.
          Add a tag to apply a reply only to matching tickets. Leave blank to make it always eligible.
        </p>
        <p className="text-xs text-faint">{sampleReplies.length} / {SAMPLE_REPLY_CAP}</p>

        {sampleReplies.length === 0 ? (
          <p>No sample replies yet. Add one to teach the agent your voice.</p>
        ) : null}

        {sampleReplies.map((sample, idx) => (
          <div key={sample.id} className="space-y-2.5 rounded-xl border border-foreground/[0.10] bg-foreground/[0.02] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Example {idx + 1}</span>
              <button
                type="button"
                onClick={() => dispatch({ type: "set", patch: { sampleReplies: sampleReplies.filter((reply) => reply.id !== sample.id) } })}
                aria-label="Remove sample reply"
                className="-m-1 p-1 text-faint transition-colors hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <CharacterCountTextarea
              aria-label={`Sample reply ${idx + 1} body`}
              value={sample.body}
              onValueChange={(value) => dispatch({
                type: "set",
                patch: {
                  sampleReplies: sampleReplies.map((reply) => reply.id === sample.id ? { ...reply, body: value } : reply),
                },
              })}
              placeholder="e.g. Hey! Totally hear you on the wait — let me chase that down and get back to you with an update."
              maxLength={SAMPLE_REPLY_BODY_MAX}
              rows={2}
              wrapperClassName="space-y-1"
              textareaClassName={settingsTextareaClassName}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledTextInput
                label="When to use"
                hint="optional"
                aria-label={`Sample reply ${idx + 1} usage context`}
                value={sample.context ?? ""}
                onChange={(event) => dispatch({
                  type: "set",
                  patch: {
                    sampleReplies: sampleReplies.map((reply) => reply.id === sample.id
                      ? { ...reply, context: event.target.value || undefined }
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
                onChange={(event) => dispatch({
                  type: "set",
                  patch: {
                    sampleReplies: sampleReplies.map((reply) => reply.id === sample.id
                      ? { ...reply, tag: event.target.value || undefined }
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
      </div>
    </SettingsTile>
  )
}
