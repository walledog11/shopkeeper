"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Loader2, PenLine } from "lucide-react"
import { BRAND_VOICE_MAX_CHARS, VOICE_TRAITS, type VoiceTraitId, type VoiceTraits } from "@shopkeeper/agent/settings"
import { PageTitle } from "@/app/dashboard/_components/PageTitle"
import { voiceNavItem } from "@/app/dashboard/_components/nav-items"
import { dashboardChromeColumnClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { useIsWorkspaceAdmin } from "@/app/dashboard/_components/WorkspaceRoleContext"
import { CustomerBubble } from "@/components/agent/VoiceReplyBubble"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { VOICE_CATEGORIES, VOICE_SCENARIOS, findVoiceScenario, type VoiceCategory } from "@/lib/agent/voice"
import {
  draftVoiceReply,
  errorMessage,
  saveVoiceExample,
  saveVoiceSettings,
  type VoiceReply,
} from "@/lib/agent/voice-requests"
import { cn } from "@/lib/ui/cn"

type Side = "a" | "b"
const SIDES: readonly Side[] = ["a", "b"]
const PROGRESS_WIDTHS = ["w-0", "w-1/5", "w-2/5", "w-3/5", "w-4/5", "w-full"] as const

interface Round {
  id: number
  category: VoiceCategory
  scenarioId: string
  traitId: VoiceTraitId
  // The option each reply is written with; every other trait is the voice as it stood.
  values: Record<Side, string>
  replies: Record<Side, VoiceReply>
  answer: Side | "written" | null
}

function traitOf(id: VoiceTraitId) {
  return VOICE_TRAITS.find((trait) => trait.id === id) ?? VOICE_TRAITS[0]
}

function withTrait(traits: VoiceTraits, id: VoiceTraitId, value: string): VoiceTraits {
  return { ...traits, [id]: value } as VoiceTraits
}

// The next comparison: a trait not yet learned, else the one asked longest ago,
// on the category's next conversation. Sides alternate so the first reply isn't
// always the same option.
function planRound(traits: VoiceTraits, rounds: readonly Round[], category: VoiceCategory, id: number): Round {
  const lastAsked = (traitId: VoiceTraitId) => rounds.map((round) => round.traitId).lastIndexOf(traitId)
  const [trait = VOICE_TRAITS[0]] = [...VOICE_TRAITS].sort((x, y) => (
    Number(Boolean(traits[x.id])) - Number(Boolean(traits[y.id])) || lastAsked(x.id) - lastAsked(y.id)
  ))
  const scenarios = VOICE_SCENARIOS.filter((scenario) => scenario.category === category)
  const asked = rounds.filter((round) => round.category === category).length
  const scenario = scenarios[asked % scenarios.length] ?? VOICE_SCENARIOS[0]
  const [first, second] = trait.options
  return {
    id,
    category,
    scenarioId: scenario.id,
    traitId: trait.id,
    values: id % 2 === 0 ? { a: first.value, b: second.value } : { a: second.value, b: first.value },
    replies: { a: { status: "loading" }, b: { status: "loading" } },
    answer: null,
  }
}

export default function VoicePageClient({ initialTraits, initialNotes }: { initialTraits: VoiceTraits; initialNotes: string }) {
  const isAdmin = useIsWorkspaceAdmin()
  const [traits, setTraits] = useState<VoiceTraits>(initialTraits)
  const [rounds, setRounds] = useState<Round[]>([])
  const [index, setIndex] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [written, setWritten] = useState("")
  const [savingWritten, setSavingWritten] = useState(false)
  const [writtenNote, setWrittenNote] = useState<string | null>(null)
  const nextId = useRef(0)
  const started = useRef(false)

  const draftSide = useCallback((round: Round, voice: VoiceTraits, side: Side) => {
    void draftVoiceReply(withTrait(voice, round.traitId, round.values[side]), round.scenarioId).then((reply) => {
      setRounds((current) => current.map((entry) => (
        entry.id === round.id ? { ...entry, replies: { ...entry.replies, [side]: reply } } : entry
      )))
    })
  }, [])

  // Appends the next comparison and drafts both of its replies.
  const withNextRound = useCallback((voice: VoiceTraits, existing: Round[], inCategory: VoiceCategory): Round[] => {
    const round = planRound(voice, existing, inCategory, nextId.current++)
    for (const side of SIDES) draftSide(round, voice, side)
    return [...existing, round]
  }, [draftSide])

  useEffect(() => {
    if (started.current) return
    started.current = true
    setRounds(withNextRound(initialTraits, [], "support"))
  }, [initialTraits, withNextRound])

  const round = rounds[index]
  // The category is the shown question's, so Back to another category's
  // question selects that category.
  const category: VoiceCategory = round?.category ?? "support"
  const scenario = round ? findVoiceScenario(round.scenarioId) : null
  const learned = VOICE_TRAITS.filter((trait) => traits[trait.id]).length

  function answer(answered: Round["answer"], voice: VoiceTraits) {
    if (!round) return
    const updated = rounds.map((entry) => (entry.id === round.id ? { ...entry, answer: answered } : entry))
    // Draft the next comparison now, so Next shows it without a wait.
    setRounds(index === rounds.length - 1 ? withNextRound(voice, updated, category) : updated)
  }

  async function pick(side: Side) {
    if (!round || !isAdmin) return
    const value = round.values[side]
    const voice = withTrait(traits, round.traitId, value)
    setTraits(voice)
    answer(side, voice)
    setSaveError(null)
    try {
      await saveVoiceSettings({ voiceTraits: withTrait({}, round.traitId, value) })
    } catch (error) {
      setSaveError(errorMessage(error, "Couldn't save your voice."))
    }
  }

  async function saveWritten() {
    if (!round || round.replies.a.status !== "ready" || !written.trim()) return
    setSavingWritten(true)
    setWrittenNote(null)
    try {
      const saved = await saveVoiceExample({ scenarioId: round.scenarioId, draft: round.replies.a.text, reply: written })
      if (!saved) {
        setWrittenNote("That’s very close to Reply A. Change it to how you’d really say it.")
        return
      }
      setWriting(false)
      setWritten("")
      setWrittenNote("Saved. I’ll learn from the replies you write.")
      answer("written", traits)
    } catch (error) {
      setWrittenNote(errorMessage(error, "Couldn't save your reply."))
    } finally {
      setSavingWritten(false)
    }
  }

  function go(nextIndex: number) {
    setWriting(false)
    setWrittenNote(null)
    if (nextIndex >= rounds.length) setRounds(withNextRound(traits, rounds, category))
    setIndex(nextIndex)
  }

  function chooseCategory(nextCategory: VoiceCategory) {
    if (nextCategory === category) return
    setWriting(false)
    setWrittenNote(null)
    // Unanswered comparisons are dropped rather than left behind.
    const kept = rounds.slice(0, index + 1).filter((entry) => entry.answer !== null)
    const next = withNextRound(traits, kept, nextCategory)
    setRounds(next)
    setIndex(next.length - 1)
  }

  const pickedTrait = round && (round.answer === "a" || round.answer === "b") ? traitOf(round.traitId) : null
  const pickedOption = pickedTrait?.options.find((option) => round && option.value === round.values[round.answer as Side])

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-background">
      <div className={cn(dashboardChromeColumnClassName(), "flex min-h-0 flex-1 flex-col")}>
        <div className="relative z-20 flex shrink-0 flex-col gap-3 pb-3 pt-3 md:pt-0">
          <PageTitle>{voiceNavItem.name}</PageTitle>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="grid gap-6 py-6 pb-24 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <section aria-labelledby="practice-heading" className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="practice-heading" className="text-base font-semibold text-strong">Practice</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick the reply you’d rather send. Each pick teaches Shopkeeper how you sound.
                  </p>
                </div>
                <div role="group" aria-label="Kind of question" className="flex rounded-full bg-foreground/[0.05] p-1">
                  {VOICE_CATEGORIES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={entry.id === category}
                      onClick={() => chooseCategory(entry.id)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                        entry.id === category ? "bg-background text-strong shadow-sm" : "text-muted-foreground hover:text-strong",
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-foreground/10 bg-card p-4 sm:p-6">
                {round && scenario ? (
                  <>
                    <div className="text-xs font-medium text-muted-foreground">A customer asks</div>
                    <div className="mt-2 flex flex-col">
                      <CustomerBubble name={scenario.customerName} message={scenario.message} />
                    </div>

                    {writing ? (
                      <form
                        className="mt-6 flex flex-col gap-3"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void saveWritten()
                        }}
                      >
                        <label htmlFor="voice-written" className="text-sm font-medium text-strong">
                          How would you answer {scenario.customerName}?
                        </label>
                        <Textarea
                          id="voice-written"
                          value={written}
                          maxLength={2000}
                          rows={5}
                          autoFocus
                          onChange={(event) => setWritten(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" disabled={savingWritten || !written.trim()}>
                            {savingWritten ? <Loader2 className="animate-spin" /> : null}
                            Save my reply
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setWriting(false)}>Cancel</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-6 grid gap-3 md:grid-cols-2">
                        {SIDES.map((side) => (
                          <ReplyOption
                            key={`${round.id}-${side}`}
                            label={side === "a" ? "Reply A" : "Reply B"}
                            reply={round.replies[side]}
                            picked={round.answer === side}
                            disabled={!isAdmin}
                            onPick={() => void pick(side)}
                            onRetry={() => draftSide(round, traits, side)}
                          />
                        ))}
                      </div>
                    )}

                    {pickedTrait && pickedOption ? (
                      <p role="status" className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Check className="size-4 text-strong" />
                        Got it: {pickedOption.label}.
                      </p>
                    ) : null}
                    {writtenNote ? <p role="status" className="mt-4 text-sm text-muted-foreground">{writtenNote}</p> : null}
                    {saveError ? <p role="alert" className="mt-4 text-sm text-destructive">{saveError}</p> : null}
                    {!isAdmin ? <p className="mt-4 text-sm text-muted-foreground">Only an admin can change the voice.</p> : null}

                    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-4">
                      <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
                        <ChevronLeft />
                        Back
                      </Button>
                      <Button variant="ghost" onClick={() => go(index + 1)}>
                        Next
                        <ChevronRight />
                      </Button>
                      <span className="flex-1" />
                      {!writing ? (
                        <Button
                          variant="outline"
                          onClick={() => setWriting(true)}
                          disabled={!isAdmin || round.replies.a.status !== "ready"}
                        >
                          <PenLine />
                          Write my own reply
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Getting a customer question ready…
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">The customers and orders here are made up. Nothing is sent.</p>
            </section>

            <aside className="flex flex-col gap-4">
              <section aria-labelledby="learned-heading" className="rounded-2xl border border-foreground/10 bg-card p-4">
                <h2 id="learned-heading" className="text-sm font-semibold text-strong">What I’ve learned</h2>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                  <div className={cn("h-full rounded-full bg-foreground transition-all", PROGRESS_WIDTHS[learned])} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{learned} of {VOICE_TRAITS.length} learned</p>
                <dl className="mt-4 space-y-2.5">
                  {VOICE_TRAITS.map((trait) => {
                    const chosen = trait.options.find((option) => option.value === traits[trait.id])
                    return (
                      <div key={trait.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <dt className="text-muted-foreground">{trait.label}</dt>
                        <dd className={cn("text-right", chosen ? "font-medium text-strong" : "text-muted-foreground")}>
                          {chosen?.label ?? "—"}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </section>
              <VoiceNotes initialNotes={initialNotes} disabled={!isAdmin} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReplyOption({ label, reply, picked, disabled, onPick, onRetry }: {
  label: string
  reply: VoiceReply
  picked: boolean
  disabled: boolean
  onPick: () => void
  onRetry: () => void
}) {
  const heading = (
    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      {label}
      {picked ? <Check aria-hidden className="ml-auto size-4 text-strong" /> : null}
    </span>
  )
  const frame = "flex min-h-32 flex-col gap-2 rounded-2xl border p-4 text-left"
  if (reply.status !== "ready") {
    return (
      <div className={cn(frame, "border-foreground/10")}>
        {heading}
        {reply.status === "loading" ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Writing a reply…
          </span>
        ) : (
          <span role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {reply.message}
            <button type="button" onClick={onRetry} className="underline underline-offset-4">Try again</button>
          </span>
        )}
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        frame,
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
        picked ? "border-foreground shadow-sm" : "border-foreground/10 hover:border-foreground/30",
      )}
    >
      {heading}
      <span className="whitespace-pre-wrap break-words text-sm leading-relaxed text-strong">{reply.text}</span>
    </button>
  )
}

// The merchant's own words about their voice, read with every reply alongside
// what the practice has learned.
function VoiceNotes({ initialNotes, disabled }: { initialNotes: string; disabled: boolean }) {
  const [notes, setNotes] = useState(initialNotes)
  const [savedNotes, setSavedNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await saveVoiceSettings({ brandVoice: notes.trim() })
      setSavedNotes(notes)
    } catch (caught) {
      setError(errorMessage(caught, "Couldn't save your notes."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-4">
      <label htmlFor="voice-notes" className="text-sm font-semibold text-strong">Anything else about how you sound?</label>
      <Textarea
        id="voice-notes"
        value={notes}
        maxLength={BRAND_VOICE_MAX_CHARS}
        rows={3}
        disabled={disabled}
        placeholder="For example: sign off as Sam."
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={disabled || saving || notes === savedNotes}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
        {notes === savedNotes && savedNotes.trim() ? <span className="text-xs text-muted-foreground">Saved</span> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
