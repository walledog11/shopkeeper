"use client"

import { useMemo, useReducer, useRef, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ToggleRow, SectionCard } from "./shared"
import { AGENT_SETTINGS_DEFAULTS } from "@/lib/agent/settings"
import type { OrgSettings } from "@/types"

interface Props {
  settings: OrgSettings
  version: string
}

type Action =
  | { type: 'set'; patch: Partial<OrgSettings> }
  | { type: 'reset'; payload: OrgSettings }

function reducer(state: OrgSettings, action: Action): OrgSettings {
  if (action.type === 'reset') return action.payload
  return { ...state, ...action.patch }
}

// Map legacy integer UTC offsets to curated IANA zones so users never see
// "Etc/GMT+5" in the dropdown. Picks the most populous merchant region per
// offset; users can always change to their actual zone after.
const OFFSET_TO_CURATED_ZONE: Record<number, string> = {
  [-10]: 'Pacific/Honolulu',
  [-9]:  'America/Anchorage',
  [-8]:  'America/Los_Angeles',
  [-7]:  'America/Denver',
  [-6]:  'America/Chicago',
  [-5]:  'America/New_York',
  [-4]:  'America/Halifax',
  [-3]:  'America/Sao_Paulo',
  [0]:   'Europe/London',
  [1]:   'Europe/Paris',
  [2]:   'Europe/Athens',
  [3]:   'Europe/Moscow',
  [4]:   'Asia/Dubai',
  [5]:   'Asia/Karachi',
  [6]:   'Asia/Dhaka',
  [7]:   'Asia/Bangkok',
  [8]:   'Asia/Singapore',
  [9]:   'Asia/Tokyo',
  [10]:  'Australia/Sydney',
  [12]:  'Pacific/Auckland',
  [13]:  'Pacific/Fiji',
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}

function hydrateTz(existing: string | undefined, legacyOffset: number | undefined): string {
  if (existing && existing.trim() !== '' && !existing.startsWith('Etc/')) return existing
  if (typeof legacyOffset === 'number') {
    const mapped = OFFSET_TO_CURATED_ZONE[Math.round(legacyOffset)]
    if (mapped) return mapped
  }
  return browserTz()
}

function hydrate(settings: OrgSettings): OrgSettings {
  return {
    ...settings,
    digestTimezone: hydrateTz(settings.digestTimezone, settings.digestTimezoneOffset),
    businessHoursTimezone: hydrateTz(settings.businessHoursTimezone, settings.businessHoursTimezoneOffset),
  }
}

// Curated list of ~30 zones grouped by region. One entry per DST region —
// e.g. "Europe/Paris" covers Berlin / Madrid / Rome / Amsterdam.
// All entries are real IANA ids, so DST is handled by Intl automatically.
const TIMEZONE_GROUPS: { label: string; zones: { id: string; label: string }[] }[] = [
  {
    label: 'Americas',
    zones: [
      { id: 'Pacific/Honolulu',     label: 'Hawaii — Honolulu' },
      { id: 'America/Anchorage',    label: 'Alaska — Anchorage' },
      { id: 'America/Los_Angeles',  label: 'Pacific Time — Los Angeles, Vancouver' },
      { id: 'America/Phoenix',      label: 'Arizona — Phoenix' },
      { id: 'America/Denver',       label: 'Mountain Time — Denver, Edmonton' },
      { id: 'America/Chicago',      label: 'Central Time — Chicago, Mexico City' },
      { id: 'America/New_York',     label: 'Eastern Time — New York, Toronto' },
      { id: 'America/Halifax',      label: 'Atlantic Time — Halifax' },
      { id: 'America/Sao_Paulo',    label: 'São Paulo' },
      { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
    ],
  },
  {
    label: 'Europe',
    zones: [
      { id: 'Europe/London',        label: 'London, Dublin, Lisbon' },
      { id: 'Europe/Paris',         label: 'Central European Time — Paris, Berlin, Madrid, Rome' },
      { id: 'Europe/Athens',        label: 'Eastern European Time — Athens, Helsinki, Bucharest' },
      { id: 'Europe/Istanbul',      label: 'Istanbul' },
      { id: 'Europe/Moscow',        label: 'Moscow' },
    ],
  },
  {
    label: 'Africa & Middle East',
    zones: [
      { id: 'Africa/Lagos',         label: 'Lagos' },
      { id: 'Africa/Cairo',         label: 'Cairo' },
      { id: 'Africa/Johannesburg',  label: 'Johannesburg' },
      { id: 'Asia/Jerusalem',       label: 'Jerusalem' },
      { id: 'Asia/Dubai',           label: 'Dubai' },
      { id: 'Asia/Tehran',          label: 'Tehran' },
    ],
  },
  {
    label: 'Asia',
    zones: [
      { id: 'Asia/Karachi',         label: 'Karachi' },
      { id: 'Asia/Kolkata',         label: 'India — Mumbai, Delhi' },
      { id: 'Asia/Dhaka',           label: 'Dhaka' },
      { id: 'Asia/Bangkok',         label: 'Bangkok, Jakarta' },
      { id: 'Asia/Singapore',       label: 'Singapore, Hong Kong, Manila' },
      { id: 'Asia/Shanghai',        label: 'Shanghai, Beijing' },
      { id: 'Asia/Tokyo',           label: 'Tokyo, Seoul' },
    ],
  },
  {
    label: 'Oceania',
    zones: [
      { id: 'Australia/Perth',      label: 'Perth' },
      { id: 'Australia/Adelaide',   label: 'Adelaide' },
      { id: 'Australia/Sydney',     label: 'Sydney, Melbourne, Brisbane' },
      { id: 'Pacific/Auckland',     label: 'Auckland' },
      { id: 'Pacific/Fiji',         label: 'Fiji' },
    ],
  },
]

const KNOWN_TIMEZONE_IDS = new Set(TIMEZONE_GROUPS.flatMap(g => g.zones.map(z => z.id)))

function TimezoneSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  // Show a passthrough only for legitimate IANA values outside our curated list
  // (e.g. America/Tijuana). Never surface Etc/GMT* — those are legacy garbage.
  const isUnknown = value !== '' && !KNOWN_TIMEZONE_IDS.has(value) && !value.startsWith('Etc/')
  return (
    <select
      value={KNOWN_TIMEZONE_IDS.has(value) || isUnknown ? value : ''}
      onChange={e => onChange(e.target.value)}
      className={className}
    >
      {isUnknown && <option value={value}>{value}</option>}
      {TIMEZONE_GROUPS.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.zones.map(z => (
            <option key={z.id} value={z.id}>{z.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

const DAY_OPTIONS = [['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun']] as const
const DIGEST_DAYS_OPTIONS = [['every_day', 'Every day'], ['weekdays', 'Weekdays only']] as const

interface RawInputs {
  maxRefund: string
  dailyRefundCap: string
  maxIter: string
  digestHour: string
  digestSecondHour: string
  bhStart: string
  bhEnd: string
}

function clampHour(s: string, fallback: number): number {
  const n = s.trim() === '' ? fallback : parseInt(s, 10)
  return Math.min(23, Math.max(0, isNaN(n) ? fallback : n))
}

function buildPayload(state: OrgSettings, raw: RawInputs): OrgSettings {
  const parsedMax = raw.maxRefund.trim() === '' ? null : Number(raw.maxRefund)
  const parsedDaily = raw.dailyRefundCap.trim() === '' ? null : Number(raw.dailyRefundCap)
  const parsedIter = Number(raw.maxIter)
  return {
    ...state,
    agentName: state.agentName.trim() || 'Clerk',
    maxRefundAmount: parsedMax === null || isNaN(parsedMax) ? null : parsedMax,
    dailyRefundCap: parsedDaily === null || isNaN(parsedDaily) ? null : parsedDaily,
    maxIterations: isNaN(parsedIter) || parsedIter < 1 ? 10 : parsedIter,
    digestHour: clampHour(raw.digestHour, 8),
    digestSecondHour: clampHour(raw.digestSecondHour, 17),
    businessHoursStart: clampHour(raw.bhStart, 9),
    businessHoursEnd: clampHour(raw.bhEnd, 17),
  }
}

function rawInputsFor(s: OrgSettings): RawInputs {
  return {
    maxRefund: s.maxRefundAmount != null ? String(s.maxRefundAmount) : '',
    dailyRefundCap: s.dailyRefundCap != null ? String(s.dailyRefundCap) : '',
    maxIter: String(s.maxIterations ?? 10),
    digestHour: String(s.digestHour ?? 8),
    digestSecondHour: String(s.digestSecondHour ?? 17),
    bhStart: String(s.businessHoursStart),
    bhEnd: String(s.businessHoursEnd),
  }
}

export default function AgentTab({ settings, version }: Props) {
  const [state, dispatch] = useReducer(reducer, settings, hydrate)
  const initialRaw = useMemo(() => rawInputsFor(settings), [settings])
  const [maxRefundInput, setMaxRefundInput] = useState<string>(initialRaw.maxRefund)
  const [dailyRefundCapInput, setDailyRefundCapInput] = useState<string>(initialRaw.dailyRefundCap)
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

  const payload = useMemo(
    () => buildPayload(state, {
      maxRefund: maxRefundInput,
      dailyRefundCap: dailyRefundCapInput,
      maxIter: maxIterationsInput,
      digestHour: digestHourInput,
      digestSecondHour: digestSecondHourInput,
      bhStart: businessHoursStartInput,
      bhEnd: businessHoursEndInput,
    }),
    [state, maxRefundInput, dailyRefundCapInput, maxIterationsInput, digestHourInput, digestSecondHourInput, businessHoursStartInput, businessHoursEndInput],
  )

  const initialPayloadRef = useRef<string>(JSON.stringify(payload))
  const freshBaselineRef = useRef<OrgSettings | null>(null)
  const isDirty = JSON.stringify(payload) !== initialPayloadRef.current

  const businessHoursInvalid = payload.businessHoursEnabled && payload.businessHoursEnd <= payload.businessHoursStart

  function applyBaseline(target: OrgSettings) {
    const hydrated = hydrate(target)
    const raw = rawInputsFor(target)
    dispatch({ type: 'reset', payload: hydrated })
    setMaxRefundInput(raw.maxRefund)
    setDailyRefundCapInput(raw.dailyRefundCap)
    setMaxIterationsInput(raw.maxIter)
    setDigestHourInput(raw.digestHour)
    setDigestSecondHourInput(raw.digestSecondHour)
    setBusinessHoursStartInput(raw.bhStart)
    setBusinessHoursEndInput(raw.bhEnd)
    initialPayloadRef.current = JSON.stringify(buildPayload(hydrated, raw))
  }

  function reset() {
    applyBaseline(freshBaselineRef.current ?? settings)
    freshBaselineRef.current = null
    setError(null)
    setStaleVersion(false)
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
        body: JSON.stringify({ settings: payload, version: currentVersion }),
      })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as {
          current?: { version?: string; settings?: Partial<OrgSettings> }
        }
        if (body.current?.version) setCurrentVersion(body.current.version)
        if (body.current?.settings) {
          // Capture fresh server state so Reset jumps to it instead of the stale prop.
          freshBaselineRef.current = { ...AGENT_SETTINGS_DEFAULTS, ...body.current.settings } as OrgSettings
        }
        setStaleVersion(true)
        return
      }
      if (!res.ok) throw new Error('Failed')
      const body = await res.json().catch(() => ({})) as { version?: string }
      if (body.version) setCurrentVersion(body.version)
      initialPayloadRef.current = JSON.stringify(payload)
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

      <SectionCard title="Default Behavior" description="What the agent does automatically when a ticket is opened.">
        <div className="space-y-5">
          <ToggleRow
            label="Auto-plan on ticket open"
            description="Automatically generate an action plan when you open a ticket with an unread customer message."
            checked={state.autoPlanOnOpen}
            onChange={v => dispatch({ type: 'set', patch: { autoPlanOnOpen: v } })}
          />
          <ToggleRow
            label="Always draft a customer reply"
            description="Include a draft reply in every plan, even when no actions are needed."
            checked={state.alwaysDraftReply}
            onChange={v => dispatch({ type: 'set', patch: { alwaysDraftReply: v } })}
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

      <SectionCard title="Approval Workflow" description="Control when a human must approve before the agent acts.">
        <ToggleRow
          label="Require approval before executing actions"
          description="Show a plan card and wait for your confirmation before the agent runs any Shopify or communication actions."
          checked={state.requireApprovalForActions}
          onChange={v => dispatch({ type: 'set', patch: { requireApprovalForActions: v } })}
        />
      </SectionCard>

      <SectionCard title="Tool Permissions" description="Choose which categories of tools the agent is allowed to use.">
        <div className="space-y-4">
          <ToggleRow
            label="Actions"
            description="Shopify write operations: issue refunds, cancel orders, update shipping addresses, add Shopify notes."
            checked={state.toolsEnabled.action}
            onChange={v => dispatch({ type: 'set', patch: { toolsEnabled: { ...state.toolsEnabled, action: v } } })}
            badge="High impact"
            badgeColor="text-orange-300 bg-orange-400/10 border-orange-400/25"
          />
          <ToggleRow
            label="Communication"
            description="Send replies to customers on their channel (email, Instagram DM, etc.)."
            checked={state.toolsEnabled.communication}
            onChange={v => dispatch({ type: 'set', patch: { toolsEnabled: { ...state.toolsEnabled, communication: v } } })}
            badge="Customer-facing"
            badgeColor="text-blue-300 bg-blue-400/10 border-blue-400/25"
          />
          <ToggleRow
            label="Internal"
            description="Add internal notes, update ticket status, and update ticket tags."
            checked={state.toolsEnabled.internal}
            onChange={v => dispatch({ type: 'set', patch: { toolsEnabled: { ...state.toolsEnabled, internal: v } } })}
            badge="Internal"
            badgeColor="text-violet-300 bg-violet-400/10 border-violet-400/25"
          />
          <ToggleRow
            label="Read"
            description="Fetch Shopify customer profiles and order history. Read-only — no changes are made."
            checked={state.toolsEnabled.read}
            onChange={v => dispatch({ type: 'set', patch: { toolsEnabled: { ...state.toolsEnabled, read: v } } })}
            badge="Read-only"
            badgeColor="text-white/50 bg-white/[0.05] border-white/[0.10]"
          />
        </div>
      </SectionCard>

      <SectionCard title="Guardrails" description="Hard limits that the agent will never exceed.">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Max refund amount
              <span className="ml-1.5 font-normal text-white/30">· leave blank for no limit</span>
            </label>
            <div className="relative w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">$</span>
              <Input
                value={maxRefundInput}
                onChange={e => setMaxRefundInput(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 50"
                className="h-9 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25 pl-7"
              />
            </div>
            <p className="text-[11px] text-white/30">Refunds above this amount will require manual approval.</p>
          </div>
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
          <ToggleRow
            label="Block order cancellations"
            description="Prevent the agent from cancelling orders entirely. Cancellations will require manual handling."
            checked={state.blockCancellations}
            onChange={v => dispatch({ type: 'set', patch: { blockCancellations: v } })}
          />
          <ToggleRow
            label="Block custom line items"
            description="Require a Shopify variant ID on all new orders. Prevents the agent from creating orders with ad-hoc line items."
            checked={state.blockCustomLineItems}
            onChange={v => dispatch({ type: 'set', patch: { blockCustomLineItems: v } })}
          />
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
