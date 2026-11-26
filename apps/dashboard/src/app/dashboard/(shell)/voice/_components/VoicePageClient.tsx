"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { BRAND_VOICE_MAX_CHARS } from "@shopkeeper/agent/settings"
import { PageTitle } from "@/app/dashboard/_components/PageTitle"
import { voiceNavItem } from "@/app/dashboard/_components/nav-items"
import { dashboardChromeColumnClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { useIsWorkspaceAdmin } from "@/app/dashboard/_components/WorkspaceRoleContext"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CustomerBubble, VoiceReplyBubble } from "@/components/agent/VoiceReplyBubble"
import { requestJson } from "@/lib/api/fetcher"
import { VOICE_PRESETS, VOICE_SCENARIOS, type VoiceScenario } from "@/lib/agent/voice"
import {
  draftVoiceReply,
  errorMessage,
  rewriteVoiceBrief,
  suggestVoiceOptions,
  type VoiceReply,
} from "@/lib/agent/voice-requests"
import { cn } from "@/lib/ui/cn"


interface VoiceOption {
  label: string
  brief: string
  reply: VoiceReply
}

const COMPARE_SCENARIO = VOICE_SCENARIOS[0]

export default function VoicePageClient({ initialBrief }: { initialBrief: string }) {
  const isAdmin = useIsWorkspaceAdmin()
  const [savedBrief, setSavedBrief] = useState(initialBrief)
  const [brief, setBrief] = useState(initialBrief)
  const [repliesBrief, setRepliesBrief] = useState(initialBrief)
  const [replies, setReplies] = useState<Record<string, VoiceReply>>({})
  const [change, setChange] = useState("")
  const [rewriting, setRewriting] = useState(false)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const [options, setOptions] = useState<VoiceOption[] | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Replies for a voice the merchant has since moved on from are dropped.
  const latestPreview = useRef(0)

  const previewAll = useCallback((nextBrief: string) => {
    const request = ++latestPreview.current
    setRepliesBrief(nextBrief)
    setReplies(Object.fromEntries(VOICE_SCENARIOS.map((scenario) => [scenario.id, { status: "loading" } as VoiceReply])))
    for (const scenario of VOICE_SCENARIOS) {
      void draftVoiceReply(nextBrief, scenario.id).then((reply) => {
        if (request !== latestPreview.current) return
        setReplies((current) => ({ ...current, [scenario.id]: reply }))
      })
    }
  }, [])

  useEffect(() => {
    previewAll(initialBrief)
  }, [initialBrief, previewAll])

  const tryBrief = (nextBrief: string) => {
    setBrief(nextBrief)
    setOptions(null)
    previewAll(nextBrief)
  }

  const applyChange = async () => {
    if (!change.trim()) return
    setRewriting(true)
    setRewriteError(null)
    try {
      const nextBrief = await rewriteVoiceBrief(brief, change)
      setChange("")
      tryBrief(nextBrief)
    } catch (error) {
      setRewriteError(errorMessage(error, "Couldn't change the voice."))
    } finally {
      setRewriting(false)
    }
  }

  const compare = async () => {
    setComparing(true)
    setCompareError(null)
    setOptions(null)
    try {
      const suggested = await suggestVoiceOptions(brief)
      setOptions(suggested.map((option) => ({ ...option, reply: { status: "loading" } })))
      suggested.forEach((option, index) => {
        void draftVoiceReply(option.brief, COMPARE_SCENARIO.id).then((reply) => {
          setOptions((current) => current?.map((entry, entryIndex) => (entryIndex === index ? { ...entry, reply } : entry)) ?? null)
        })
      })
    } catch (error) {
      setCompareError(errorMessage(error, "Couldn't suggest two voices."))
    } finally {
      setComparing(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await requestJson<{ version: string }>(
        "/api/org",
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: { brandVoice: brief } }) },
        "Couldn't save the voice.",
      )
      setSavedBrief(brief)
    } catch (error) {
      setSaveError(errorMessage(error, "Couldn't save the voice."))
    } finally {
      setSaving(false)
    }
  }

  const unsaved = brief !== savedBrief
  const repliesStale = brief !== repliesBrief

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-background">
      <div className={cn(dashboardChromeColumnClassName(), "flex min-h-0 flex-1 flex-col")}>
        <div className="relative z-20 flex shrink-0 flex-col gap-3 pb-3 pt-3 md:pt-0">
          <PageTitle>{voiceNavItem.name}</PageTitle>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="flex flex-col gap-10 py-6 pb-24">
            <section className="flex flex-col gap-4" aria-labelledby="voice-brief-heading">
              <div>
                <h2 id="voice-brief-heading" className="text-base font-semibold text-strong">How your replies sound</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Shopkeeper writes every customer reply in this voice. Pick a starting point or say what to change, and the sample replies below update. Customers see nothing new until you save.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {VOICE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => tryBrief(preset.brief)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      brief === preset.brief
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/15 text-foreground hover:bg-foreground/[0.04]",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="voice-brief" className="mb-1.5 block text-sm font-medium text-strong">Your voice</label>
                <Textarea
                  id="voice-brief"
                  value={brief}
                  maxLength={BRAND_VOICE_MAX_CHARS}
                  rows={3}
                  placeholder="For example: warm and friendly, short sentences, sign off as Sam."
                  onChange={(event) => setBrief(event.target.value)}
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{brief.length} / {BRAND_VOICE_MAX_CHARS}</p>
              </div>

              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  void applyChange()
                }}
              >
                <label htmlFor="voice-change" className="sr-only">Say what to change</label>
                <input
                  id="voice-change"
                  value={change}
                  maxLength={300}
                  onChange={(event) => setChange(event.target.value)}
                  placeholder="Say what to change, like “less formal”"
                  className="h-10 flex-1 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                />
                <Button type="submit" variant="outline" disabled={rewriting || !change.trim()}>
                  {rewriting ? <Loader2 className="animate-spin" /> : null}
                  Change it
                </Button>
              </form>
              {rewriteError ? <p role="alert" className="text-sm text-destructive">{rewriteError}</p> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void save()} disabled={!unsaved || saving || !isAdmin}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  Save voice
                </Button>
                {unsaved ? (
                  <Button variant="ghost" onClick={() => tryBrief(savedBrief)}>Undo changes</Button>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {!isAdmin ? "Only an admin can change the voice." : unsaved ? "Not saved yet." : "Saved."}
                </p>
              </div>
              {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="voice-samples-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="voice-samples-heading" className="text-base font-semibold text-strong">Sample replies</h2>
                  <p className="mt-1 text-sm text-muted-foreground">What Shopkeeper would send to these customers. The customers and orders are made up.</p>
                </div>
                {repliesStale ? (
                  <Button variant="outline" onClick={() => previewAll(brief)}>
                    <RefreshCw />
                    Update replies
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {VOICE_SCENARIOS.map((scenario) => (
                  <SampleConversation
                    key={scenario.id}
                    scenario={scenario}
                    reply={replies[scenario.id] ?? { status: "loading" }}
                    onRetry={() => {
                      setReplies((current) => ({ ...current, [scenario.id]: { status: "loading" } }))
                      void draftVoiceReply(repliesBrief, scenario.id).then((reply) => setReplies((current) => ({ ...current, [scenario.id]: reply })))
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="voice-compare-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="voice-compare-heading" className="text-base font-semibold text-strong">Which sounds more like you?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Two different voices answering {COMPARE_SCENARIO.customerName}. Pick the one you like and keep tuning from there.</p>
                </div>
                <Button variant="outline" onClick={() => void compare()} disabled={comparing}>
                  {comparing ? <Loader2 className="animate-spin" /> : null}
                  {options ? "Show two more" : "Show me two versions"}
                </Button>
              </div>
              {compareError ? <p role="alert" className="text-sm text-destructive">{compareError}</p> : null}
              {options ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {options.map((option, index) => (
                    <div key={`${index}-${option.label}`} className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4">
                      <div className="text-sm font-semibold text-strong">{option.label}</div>
                      <p className="text-xs text-muted-foreground">{option.brief}</p>
                      <VoiceReplyBubble reply={option.reply} />
                      <Button variant="outline" className="self-start" onClick={() => tryBrief(option.brief)}>Use this voice</Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function SampleConversation({ scenario, reply, onRetry }: { scenario: VoiceScenario; reply: VoiceReply; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{scenario.label}</div>
      <CustomerBubble name={scenario.customerName} message={scenario.message} />
      <VoiceReplyBubble reply={reply} onRetry={onRetry} />
    </div>
  )
}
