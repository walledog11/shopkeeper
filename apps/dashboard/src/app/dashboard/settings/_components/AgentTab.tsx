"use client"

import { useMemo, useReducer, useRef, useState } from "react"
import { useSWRConfig } from "swr"
import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ToggleRow, SectionCard } from "./shared"
import { TimezoneSelect } from "./TimezoneSelect"
import {
  DAY_OPTIONS,
  DIGEST_DAYS_OPTIONS,
  agentSettingsReducer,
  applyTierDefaultsToInheritedSettings,
  buildAgentSettingsPatch,
  buildSettingsPayload,
  collectExplicitOverridePaths,
  hydrateSettings,
  rawInputsFor,
  readSettingsPath,
  resetPathToTierDefault,
  tierDefaultForPath,
  writeSettingsPath,
  type AutonomyOverridePath,
} from "./agent-tab-helpers"
import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers"
import { resolveAgentSettings, type AutonomyTier } from "@/lib/agent/settings"
import type { OrgSettings } from "@/types"

const SAMPLE_REPLY_CAP = 10
const SAMPLE_REPLY_BODY_MAX = 300

interface Props {
  settings: OrgSettings
  rawSettings: Partial<OrgSettings>
  version: string
}

function tierLabel(tier: AutonomyTier): string {
  return AUTONOMY_TIERS.find(option => option.id === tier)?.label ?? tier
}

function formatOverrideValue(path: AutonomyOverridePath, value: unknown): string {
  if (path === "maxRefundAmount") {
    return typeof value === "number" ? `$${value}` : "No limit"
  }
  if (typeof value === "boolean") return value ? "On" : "Off"
  return value == null ? "Not set" : String(value)
}

export default function AgentTab({ settings, rawSettings, version }: Props) {
  const { mutate } = useSWRConfig()
  const [state, dispatch] = useReducer(agentSettingsReducer, settings, hydrateSettings)
  const initialRaw = useMemo(() => rawInputsFor(settings), [settings])
  const [maxRefundInput, setMaxRefundInput] = useState<string>(initialRaw.maxRefund)
  const [dailyRefundCapInput, setDailyRefundCapInput] = useState<string>(initialRaw.dailyRefundCap)
  const [dailyLLMSpendCapInput, setDailyLLMSpendCapInput] = useState<string>(initialRaw.dailyLLMSpendCap)
  const [maxIterationsInput, setMaxIterationsInput] = useState<string>(initialRaw.maxIter)
  const [digestHourInput, setDigestHourInput] = useState<string>(initialRaw.digestHour)
  const [digestSecondHourInput, setDigestSecondHourInput] = useState<string>(initialRaw.digestSecondHour)
  const [businessHoursStartInput, setBusinessHoursStartInput] = useState<string>(initialRaw.bhStart)
  const [businessHoursEndInput, setBusinessHoursEndInput] = useState<string>(initialRaw.bhEnd)
  const [currentVersion, setCurrentVersion] = useState(version)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staleVersion, setStaleVersion] = useState(false)
  const [explicitOverridePaths, setExplicitOverridePaths] = useState<AutonomyOverridePath[]>(
    () => collectExplicitOverridePaths(rawSettings),
  )

  const payload = useMemo(
    () => buildSettingsPayload(state, {
      maxRefund: maxRefundInput,
      dailyRefundCap: dailyRefundCapInput,
      dailyLLMSpendCap: dailyLLMSpendCapInput,
      maxIter: maxIterationsInput,
      digestHour: digestHourInput,
      digestSecondHour: digestSecondHourInput,
      bhStart: businessHoursStartInput,
      bhEnd: businessHoursEndInput,
    }),
    [state, maxRefundInput, dailyRefundCapInput, dailyLLMSpendCapInput, maxIterationsInput, digestHourInput, digestSecondHourInput, businessHoursStartInput, businessHoursEndInput],
  )

  const settingsPatch = useMemo(
    () => buildAgentSettingsPatch(payload, explicitOverridePaths),
    [payload, explicitOverridePaths],
  )
  const serializedPatch = useMemo(() => JSON.stringify(settingsPatch), [settingsPatch])
  const initialPatchRef = useRef<string>(serializedPatch)
  const baselineRawRef = useRef<Partial<OrgSettings>>(rawSettings)
  const freshBaselineRef = useRef<Partial<OrgSettings> | null>(null)
  const explicitOverrideSet = useMemo(() => new Set(explicitOverridePaths), [explicitOverridePaths])
  const isDirty = serializedPatch !== initialPatchRef.current

  const businessHoursInvalid = payload.businessHoursEnabled && payload.businessHoursEnd <= payload.businessHoursStart

  function markExplicit(path: AutonomyOverridePath) {
    setExplicitOverridePaths(prev => prev.includes(path) ? prev : [...prev, path])
  }

  function clearExplicit(path: AutonomyOverridePath) {
    setExplicitOverridePaths(prev => prev.filter(item => item !== path))
  }

  function applyBaseline(target: Partial<OrgSettings>) {
    const hydrated = hydrateSettings(resolveAgentSettings(target))
    const explicit = collectExplicitOverridePaths(target)
    const raw = rawInputsFor(hydrated)
    dispatch({ type: 'reset', payload: hydrated })
    setExplicitOverridePaths(explicit)
    setMaxRefundInput(raw.maxRefund)
    setDailyRefundCapInput(raw.dailyRefundCap)
    setDailyLLMSpendCapInput(raw.dailyLLMSpendCap)
    setMaxIterationsInput(raw.maxIter)
    setDigestHourInput(raw.digestHour)
    setDigestSecondHourInput(raw.digestSecondHour)
    setBusinessHoursStartInput(raw.bhStart)
    setBusinessHoursEndInput(raw.bhEnd)
    baselineRawRef.current = target
    initialPatchRef.current = JSON.stringify(buildAgentSettingsPatch(buildSettingsPayload(hydrated, raw), explicit))
  }

  function reset() {
    applyBaseline(freshBaselineRef.current ?? baselineRawRef.current)
    freshBaselineRef.current = null
    setError(null)
    setStaleVersion(false)
  }

  function selectTier(tier: AutonomyTier) {
    const next = applyTierDefaultsToInheritedSettings(state, tier, explicitOverridePaths)
    dispatch({ type: 'reset', payload: next })
    if (!explicitOverrideSet.has("maxRefundAmount")) {
      setMaxRefundInput(rawInputsFor(next).maxRefund)
    }
  }

  function setAutonomyOverride(path: AutonomyOverridePath, value: unknown) {
    markExplicit(path)
    dispatch({ type: 'reset', payload: writeSettingsPath(state, path, value) as OrgSettings })
  }

  function resetAutonomyOverride(path: AutonomyOverridePath) {
    clearExplicit(path)
    const next = resetPathToTierDefault(state, path)
    dispatch({ type: 'reset', payload: next })
    if (path === "maxRefundAmount") {
      setMaxRefundInput(rawInputsFor(next).maxRefund)
    }
  }

  function OverrideHint({ path }: { path: AutonomyOverridePath }) {
    const tier = state.autonomyTier ?? "guarded"
    const explicit = explicitOverrideSet.has(path)
    const defaultValue = formatOverrideValue(path, tierDefaultForPath(tier, path))
    const currentValue = formatOverrideValue(path, readSettingsPath(payload, path))

    return (
      <p className="text-[11px] text-white/30">
        Default for {tierLabel(tier)}: {defaultValue}
        {explicit ? (
          <>
            <span> · You set: {currentValue}</span>
            <button
              type="button"
              onClick={() => resetAutonomyOverride(path)}
              className="ml-2 font-semibold text-amber-300 hover:text-amber-200"
            >
              Reset to tier default
            </button>
          </>
        ) : (
          <span> · Using tier default</span>
        )}
      </p>
    )
  }

  async function save() {
    setError(null)
    setStaleVersion(false)
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settingsPatch.settings,
          settingsUnset: settingsPatch.settingsUnset,
          version: currentVersion,
        }),
      })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as {
          current?: { version?: string; settings?: Partial<OrgSettings> }
        }
        if (body.current?.version) setCurrentVersion(body.current.version)
        if (body.current?.settings) {
          // Capture fresh server state so Reset jumps to it instead of the stale prop.
          freshBaselineRef.current = body.current.settings
        }
        setStaleVersion(true)
        return
      }
      if (!res.ok) throw new Error('Failed')
      const body = await res.json().catch(() => ({})) as { version?: string; settings?: Partial<OrgSettings> }
      if (body.version) setCurrentVersion(body.version)
      if (body.settings) baselineRawRef.current = body.settings
      void mutate(
        '/api/org',
        (current: { settings?: Partial<OrgSettings>; version?: string } | undefined) => ({
          ...(current ?? {}),
          ...(body.version ? { version: body.version } : {}),
          ...(body.settings ? { settings: body.settings } : {}),
        }),
        { revalidate: false },
      )
      initialPatchRef.current = serializedPatch
      freshBaselineRef.current = null
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white/80">Agent</h1>
        <p className="text-sm text-white/35 mt-0.5">Configure how your AI agent behaves, what it can do, and how it communicates.</p>
      </div>

      <div id="autonomy" className="scroll-mt-4">
        <SectionCard title="Autonomy" description="Set how much the agent can do before it asks for approval.">
          <div className="space-y-6">
            <div role="radiogroup" aria-label="Autonomy tier" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {AUTONOMY_TIERS.map(option => {
              const selected = state.autonomyTier === option.id
              const disabled = option.comingSoon
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => selectTier(option.id)}
                  className={`min-h-[104px] rounded-md border p-3 text-left transition-all ${
                    selected
                      ? "border-amber-300/60 bg-amber-300/[0.08]"
                      : "border-white/[0.10] bg-white/[0.025] hover:border-white/[0.22] hover:bg-white/[0.05]"
                  } ${disabled ? "opacity-45 cursor-not-allowed hover:border-white/[0.10] hover:bg-white/[0.025]" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full border ${selected ? "border-amber-300 bg-amber-300" : "border-white/25"}`} />
                    <span className="text-sm font-semibold text-white/75">{option.label}</span>
                    {option.recommended && (
                      <span className="rounded-sm border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-emerald-300">
                        Recommended
                      </span>
                    )}
                    {option.comingSoon && (
                      <span className="rounded-sm border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white/45">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/40">{option.blurb}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-white/30">Refund cap ${option.cap}</p>
                </button>
              )
            })}
            </div>

            <div className="space-y-5 border-t border-white/[0.08] pt-5">
            <div className="space-y-1">
              <ToggleRow
                label="Require approval before executing actions"
                description="Show a plan card and wait for your confirmation before the agent runs Shopify or communication actions."
                checked={state.requireApprovalForActions}
                onChange={v => setAutonomyOverride("requireApprovalForActions", v)}
              />
              <OverrideHint path="requireApprovalForActions" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-white/60">
                Max refund amount
                <span className="ml-1.5 font-normal text-white/30">· leave blank for no limit</span>
              </label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">$</span>
                <Input
                  value={maxRefundInput}
                  onChange={e => {
                    markExplicit("maxRefundAmount")
                    setMaxRefundInput(e.target.value.replace(/[^0-9.]/g, ''))
                  }}
                  placeholder="e.g. 50"
                  className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25 pl-7"
                />
              </div>
              <OverrideHint path="maxRefundAmount" />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-white/60">Tool permissions</p>
                <p className="text-[11px] text-white/30 mt-0.5">Override which tool categories this tier can use.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <ToggleRow
                    label="Actions"
                    description="Shopify write operations: issue refunds, cancel orders, update shipping addresses, add Shopify notes."
                    checked={state.toolsEnabled.action}
                    onChange={v => setAutonomyOverride("toolsEnabled.action", v)}
                    badge="High impact"
                    badgeColor="text-orange-300 bg-orange-400/10 border-orange-400/25"
                  />
                  <OverrideHint path="toolsEnabled.action" />
                </div>
                <div className="space-y-1">
                  <ToggleRow
                    label="Communication"
                    description="Send replies to customers on their channel."
                    checked={state.toolsEnabled.communication}
                    onChange={v => setAutonomyOverride("toolsEnabled.communication", v)}
                    badge="Customer-facing"
                    badgeColor="text-blue-300 bg-blue-400/10 border-blue-400/25"
                  />
                  <OverrideHint path="toolsEnabled.communication" />
                </div>
                <div className="space-y-1">
                  <ToggleRow
                    label="Internal"
                    description="Add internal notes, update ticket status, and update ticket tags."
                    checked={state.toolsEnabled.internal}
                    onChange={v => setAutonomyOverride("toolsEnabled.internal", v)}
                    badge="Internal"
                    badgeColor="text-violet-300 bg-violet-400/10 border-violet-400/25"
                  />
                  <OverrideHint path="toolsEnabled.internal" />
                </div>
                <div className="space-y-1">
                  <ToggleRow
                    label="Read"
                    description="Fetch Shopify customer profiles and order history. Read-only."
                    checked={state.toolsEnabled.read}
                    onChange={v => setAutonomyOverride("toolsEnabled.read", v)}
                    badge="Read-only"
                    badgeColor="text-white/50 bg-white/[0.05] border-white/[0.10]"
                  />
                  <OverrideHint path="toolsEnabled.read" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <ToggleRow
                label="Block order cancellations"
                description="Prevent the agent from cancelling orders entirely. Cancellations will require manual handling."
                checked={state.blockCancellations}
                onChange={v => setAutonomyOverride("blockCancellations", v)}
              />
              <OverrideHint path="blockCancellations" />
            </div>

            <div className="space-y-1">
              <ToggleRow
                label="Block custom line items"
                description="Require a Shopify variant ID on all new orders. Prevents the agent from creating orders with ad-hoc line items."
                checked={state.blockCustomLineItems}
                onChange={v => setAutonomyOverride("blockCustomLineItems", v)}
              />
              <OverrideHint path="blockCustomLineItems" />
            </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Identity" description="How the agent presents itself and writes replies.">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Agent name
              <span className="ml-1.5 font-normal text-white/30">· shown in the notes panel and used as the @mention trigger</span>
            </label>
            <Input value={state.agentName} onChange={e => dispatch({ type: 'set', patch: { agentName: e.target.value } })} placeholder="Clerk" className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Brand name
              <span className="ml-1.5 font-normal text-white/30">· used in AI draft prompts</span>
            </label>
            <Input value={state.aiContext} onChange={e => dispatch({ type: 'set', patch: { aiContext: e.target.value } })} placeholder="e.g. Acme Store" className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Brand voice
              <span className="ml-1.5 font-normal text-white/30">· max 200 characters</span>
            </label>
            <Textarea
              value={state.brandVoice}
              onChange={e => dispatch({ type: 'set', patch: { brandVoice: e.target.value } })}
              placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
              maxLength={200}
              rows={3}
            />
            <p className="text-[11px] text-white/30 text-right">{state.brandVoice.length}/200</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Sample replies" description="Show the agent up to 10 example replies. It will match their style and tone in customer-facing messages.">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-white/35">Add a tag to apply a reply only to matching tickets. Leave blank to make it always eligible.</p>
            <p className="text-[11px] text-white/30 shrink-0">{(state.sampleReplies ?? []).length} / {SAMPLE_REPLY_CAP}</p>
          </div>

          {(state.sampleReplies ?? []).length === 0 && (
            <p className="text-xs text-white/30 italic">No sample replies yet. Add one to teach the agent your voice.</p>
          )}

          {(state.sampleReplies ?? []).map((s, idx) => (
            <div key={s.id} className="rounded-md border border-white/[0.10] bg-white/[0.02] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/45">Example {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'set', patch: { sampleReplies: (state.sampleReplies ?? []).filter(r => r.id !== s.id) } })}
                  aria-label="Remove sample reply"
                  className="text-white/35 hover:text-red-400 transition-colors p-1 -m-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                <Textarea
                  value={s.body}
                  onChange={e => dispatch({ type: 'set', patch: { sampleReplies: (state.sampleReplies ?? []).map(r => r.id === s.id ? { ...r, body: e.target.value } : r) } })}
                  placeholder="e.g. Hey! Totally hear you on the wait — let me chase that down and get back to you with an update."
                  maxLength={SAMPLE_REPLY_BODY_MAX}
                  rows={2}
                />
                <p className="text-[11px] text-white/30 text-right">{s.body.length}/{SAMPLE_REPLY_BODY_MAX}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-white/55">
                    When to use <span className="font-normal text-white/30">· optional</span>
                  </label>
                  <Input
                    value={s.context ?? ''}
                    onChange={e => dispatch({ type: 'set', patch: { sampleReplies: (state.sampleReplies ?? []).map(r => r.id === s.id ? { ...r, context: e.target.value || undefined } : r) } })}
                    placeholder="e.g. shipping delay"
                    maxLength={80}
                    className="h-8 text-xs bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-white/55">
                    Tag <span className="font-normal text-white/30">· match against ticket tag</span>
                  </label>
                  <Input
                    value={s.tag ?? ''}
                    onChange={e => dispatch({ type: 'set', patch: { sampleReplies: (state.sampleReplies ?? []).map(r => r.id === s.id ? { ...r, tag: e.target.value || undefined } : r) } })}
                    placeholder="e.g. shipping"
                    maxLength={40}
                    className="h-8 text-xs bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              const current = state.sampleReplies ?? []
              if (current.length >= SAMPLE_REPLY_CAP) return
              dispatch({ type: 'set', patch: { sampleReplies: [...current, { id: crypto.randomUUID(), body: '' }] } })
            }}
            disabled={(state.sampleReplies ?? []).length >= SAMPLE_REPLY_CAP}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.04] text-xs font-semibold text-white/70 hover:bg-white/[0.08] hover:text-white/85 hover:border-white/[0.22] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/[0.04] disabled:hover:text-white/70 disabled:hover:border-white/[0.12]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add sample reply
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Default Behavior" description="What the agent does automatically when a ticket is opened.">
        <div className="space-y-5">
          <ToggleRow
            label="Auto-plan on ticket open"
            description="Automatically generate an action plan when you open a ticket with an unread customer message."
            checked={state.autoPlanOnOpen}
            onChange={v => dispatch({ type: 'set', patch: { autoPlanOnOpen: v } })}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Default instruction
              <span className="ml-1.5 font-normal text-white/30">· pre-filled in the plan prompt</span>
            </label>
            <Input
              value={state.defaultInstruction}
              onChange={e => dispatch({ type: 'set', patch: { defaultInstruction: e.target.value } })}
              placeholder="e.g. Resolve the customer's issue and draft a reply"
              className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Guardrails" description="Hard limits that the agent will never exceed.">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Daily refund cap
              <span className="ml-1.5 font-normal text-white/30">· leave blank for no limit</span>
            </label>
            <div className="relative w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">$</span>
              <Input
                value={dailyRefundCapInput}
                onChange={e => setDailyRefundCapInput(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 200"
                className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25 pl-7"
              />
            </div>
            <p className="text-[11px] text-white/30">Total refunds the agent can issue per day across all orders. Resets at UTC midnight.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Daily AI spend limit
              <span className="ml-1.5 font-normal text-white/30">· leave blank for $20 default</span>
            </label>
            <div className="relative w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">$</span>
              <Input
                value={dailyLLMSpendCapInput}
                onChange={e => setDailyLLMSpendCapInput(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="20"
                className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25 pl-7"
              />
            </div>
            <p className="text-[11px] text-white/30">Backstop on AI provider spend per UTC day. When reached, the agent pauses until midnight UTC.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Max iterations
              <span className="ml-1.5 font-normal text-white/30">· default 10</span>
            </label>
            <div className="w-32">
              <Input
                value={maxIterationsInput}
                onChange={e => setMaxIterationsInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="10"
                className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
              />
            </div>
            <p className="text-[11px] text-white/30">Maximum number of tool-calling steps per agent run.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Response" description="How the agent formats its customer-facing messages.">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-white/60">Reply language</label>
          <select
            value={state.replyLanguage}
            onChange={e => dispatch({ type: 'set', patch: { replyLanguage: e.target.value } })}
            className="h-9 w-56 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
          >
            <option value="auto">Auto-detect</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Portuguese">Portuguese</option>
            <option value="Italian">Italian</option>
            <option value="Japanese">Japanese</option>
            <option value="Chinese">Chinese</option>
            <option value="Korean">Korean</option>
            <option value="Arabic">Arabic</option>
          </select>
          <p className="text-[11px] text-white/30">Auto-detect matches the language the customer wrote in.</p>
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp Digest" description="Automatically send open ticket summaries to all verified team members via WhatsApp.">
        <div className="space-y-5">
          <ToggleRow
            label="Enable digest"
            description="Only sent when there are open tickets. Requires a verified WhatsApp number in Team settings."
            checked={state.digestEnabled}
            onChange={v => dispatch({ type: 'set', patch: { digestEnabled: v } })}
          />

          {state.digestEnabled && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Frequency</label>
                <select
                  value={state.digestFrequency}
                  onChange={e => dispatch({ type: 'set', patch: { digestFrequency: e.target.value as OrgSettings['digestFrequency'] } })}
                  className="h-9 w-56 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                >
                  <option value="daily">Once a day</option>
                  <option value="twice_daily">Twice a day</option>
                  <option value="every_4h">Every 4 hours</option>
                  <option value="every_6h">Every 6 hours</option>
                  <option value="every_8h">Every 8 hours</option>
                  <option value="every_12h">Every 12 hours</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-white/60">
                    {state.digestFrequency === 'twice_daily' ? 'First send time' : 'Send time'}
                    <span className="ml-1.5 font-normal text-white/30">
                      {state.digestFrequency.startsWith('every_') ? '· starting hour — repeats from here' : '· local hour (0–23)'}
                    </span>
                  </label>
                  <div className="w-32">
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={digestHourInput}
                      onChange={e => setDigestHourInput(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="8"
                      className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
                    />
                  </div>
                </div>

                {state.digestFrequency === 'twice_daily' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-white/60">
                      Second send time
                      <span className="ml-1.5 font-normal text-white/30">· local hour (0–23)</span>
                    </label>
                    <div className="w-32">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={digestSecondHourInput}
                        onChange={e => setDigestSecondHourInput(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="17"
                        className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Days</label>
                <div className="flex gap-2">
                  {DIGEST_DAYS_OPTIONS.map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => dispatch({ type: 'set', patch: { digestDays: val } })}
                      className={`h-8 px-3 rounded-md border text-xs font-semibold transition-all ${
                        state.digestDays === val
                          ? 'bg-white/[0.15] text-white border-white/[0.35]'
                          : 'bg-transparent border-white/[0.12] text-white/40 hover:border-white/[0.22] hover:text-white/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Timezone</label>
                <TimezoneSelect
                  value={state.digestTimezone ?? ''}
                  onChange={v => dispatch({ type: 'set', patch: { digestTimezone: v } })}
                  className="h-9 w-80 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                />
                <p className="text-[11px] text-white/30">Daylight Saving Time is handled automatically.</p>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Business Hours" description="Automatically send an acknowledgment to customers who message outside your working hours.">
        <div className="space-y-5">
          <ToggleRow
            label="Enable business hours"
            description="When a message arrives outside your set hours, the auto-acknowledgment is sent to the customer instead of running a plan."
            checked={state.businessHoursEnabled}
            onChange={v => dispatch({ type: 'set', patch: { businessHoursEnabled: v } })}
          />

          {state.businessHoursEnabled && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Days open</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_OPTIONS.map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => dispatch({
                        type: 'set',
                        patch: {
                          businessHoursDays: state.businessHoursDays.includes(val)
                            ? state.businessHoursDays.filter(d => d !== val)
                            : [...state.businessHoursDays, val],
                        },
                      })}
                      className={`h-8 w-12 rounded-md border text-xs font-semibold transition-all ${
                        state.businessHoursDays.includes(val)
                          ? 'bg-white/[0.15] text-white border-white/[0.35]'
                          : 'bg-transparent border-white/[0.12] text-white/40 hover:border-white/[0.22] hover:text-white/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-white/60">
                    Opens at
                    <span className="ml-1.5 font-normal text-white/30">· hour (0–23)</span>
                  </label>
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={businessHoursStartInput}
                      onChange={e => setBusinessHoursStartInput(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="9"
                      className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-white/60">
                    Closes at
                    <span className="ml-1.5 font-normal text-white/30">· hour (0–23)</span>
                  </label>
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={businessHoursEndInput}
                      onChange={e => setBusinessHoursEndInput(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="17"
                      className={`h-9 text-sm bg-white/[0.06] text-white/80 placeholder:text-white/25 ${
                        businessHoursInvalid ? 'border-red-400/60' : 'border-white/[0.12]'
                      }`}
                    />
                  </div>
                </div>
              </div>
              {businessHoursInvalid && (
                <p className="text-[11px] text-red-400">Closing time must be later than opening time.</p>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Timezone</label>
                <TimezoneSelect
                  value={state.businessHoursTimezone ?? ''}
                  onChange={v => dispatch({ type: 'set', patch: { businessHoursTimezone: v } })}
                  className="h-9 w-80 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                />
                <p className="text-[11px] text-white/30">Daylight Saving Time is handled automatically.</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">
                  Auto-acknowledgment message
                  <span className="ml-1.5 font-normal text-white/30">· max 500 characters</span>
                </label>
                <Textarea
                  value={state.autoAckMessage}
                  onChange={e => dispatch({ type: 'set', patch: { autoAckMessage: e.target.value } })}
                  placeholder="Thanks for reaching out! We're currently outside business hours and will get back to you soon."
                  maxLength={500}
                  rows={3}
                />
                <p className="text-[11px] text-white/30 text-right">{state.autoAckMessage.length}/500</p>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Spam Filter" description="Automatically classify inbound emails. Filtered ones are hidden from your inbox and purged after 7 days unless you recover them.">
        <ToggleRow
          label="Filter spam emails"
          description="When off, every email lands in your inbox as a normal ticket."
          checked={state.spamFilterEnabled ?? true}
          onChange={v => dispatch({ type: 'set', patch: { spamFilterEnabled: v } })}
        />
      </SectionCard>

      {(isDirty || saved || error || staleVersion) && (
        <div className="sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-3 pb-4 z-10">
          <div className="rounded-md border border-white/[0.10] bg-[#0c0c0c]/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.5)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {staleVersion ? (
                <p className="text-xs text-amber-300 truncate">Settings were updated in another tab. Reset to load the latest, then reapply your changes.</p>
              ) : error ? (
                <p className="text-xs text-red-400 truncate">{error}</p>
              ) : saved && !isDirty ? (
                <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Saved
                </p>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
                  <p className="text-xs text-white/70">Unsaved changes</p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={reset}
                disabled={saving || (!isDirty && !staleVersion)}
                className="text-xs font-semibold text-white/50 hover:text-white/80 disabled:opacity-30 disabled:hover:text-white/50 transition-colors px-2 py-1.5"
              >
                Reset
              </button>
              <Button
                size="sm"
                onClick={save}
                disabled={saving || !isDirty || businessHoursInvalid}
                className="h-8 px-4 bg-amber-400 text-black hover:bg-amber-300 text-xs font-semibold disabled:opacity-40 min-w-[90px]"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
