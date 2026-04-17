"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SaveButton, ToggleRow, SectionCard } from "./shared"
import type { OrgSettings, AgentToolPermissions } from "@/types"

const TIMEZONE_OPTIONS = [
  { value: '-12', label: 'UTC−12' },
  { value: '-11', label: 'UTC−11' },
  { value: '-10', label: 'UTC−10 (Honolulu)' },
  { value: '-9',  label: 'UTC−9 (Anchorage)' },
  { value: '-8',  label: 'UTC−8 (Los Angeles)' },
  { value: '-7',  label: 'UTC−7 (Denver)' },
  { value: '-6',  label: 'UTC−6 (Chicago)' },
  { value: '-5',  label: 'UTC−5 (New York)' },
  { value: '-4',  label: 'UTC−4 (Halifax / Atlantic)' },
  { value: '-3',  label: 'UTC−3 (São Paulo)' },
  { value: '-2',  label: 'UTC−2' },
  { value: '-1',  label: 'UTC−1' },
  { value: '0',   label: 'UTC+0 (London)' },
  { value: '1',   label: 'UTC+1 (Paris / Amsterdam)' },
  { value: '2',   label: 'UTC+2 (Athens / Cairo)' },
  { value: '3',   label: 'UTC+3 (Dubai / Nairobi)' },
  { value: '4',   label: 'UTC+4 (Abu Dhabi)' },
  { value: '5',   label: 'UTC+5 (Karachi)' },
  { value: '6',   label: 'UTC+6 (Dhaka)' },
  { value: '7',   label: 'UTC+7 (Bangkok)' },
  { value: '8',   label: 'UTC+8 (Singapore / Beijing)' },
  { value: '9',   label: 'UTC+9 (Tokyo / Seoul)' },
  { value: '10',  label: 'UTC+10 (Sydney)' },
  { value: '11',  label: 'UTC+11 (Solomon Islands)' },
  { value: '12',  label: 'UTC+12 (Auckland)' },
  { value: '13',  label: 'UTC+13' },
  { value: '14',  label: 'UTC+14' },
] as const

interface Props {
  settings: OrgSettings
}

export default function AgentTab({ settings }: Props) {
  const [agentName, setAgentName] = useState(settings.agentName ?? "Clerk")
  const [aiContext, setAiContext] = useState(settings.aiContext ?? "")
  const [brandVoice, setBrandVoice] = useState(settings.brandVoice ?? "")
  const [autoPlanOnOpen, setAutoPlanOnOpen] = useState(settings.autoPlanOnOpen ?? true)
  const [alwaysDraftReply, setAlwaysDraftReply] = useState(settings.alwaysDraftReply ?? false)
  const [defaultInstruction, setDefaultInstruction] = useState(settings.defaultInstruction ?? "")
  const [requireApprovalForActions, setRequireApprovalForActions] = useState(settings.requireApprovalForActions ?? true)
  const [toolsEnabled, setToolsEnabled] = useState<AgentToolPermissions>(settings.toolsEnabled ?? { action: true, communication: true, internal: true, read: true })
  const [maxRefundAmount, setMaxRefundAmount] = useState<string>(settings.maxRefundAmount != null ? String(settings.maxRefundAmount) : "")
  const [blockCancellations, setBlockCancellations] = useState(settings.blockCancellations ?? false)
  const [blockCustomLineItems, setBlockCustomLineItems] = useState(settings.blockCustomLineItems ?? false)
  const [maxIterations, setMaxIterations] = useState<string>(String(settings.maxIterations ?? 10))
  const [replyLanguage, setReplyLanguage] = useState(settings.replyLanguage ?? "auto")
  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled ?? false)
  const [digestFrequency, setDigestFrequency] = useState(settings.digestFrequency ?? 'daily')
  const [digestHour, setDigestHour] = useState<string>(String(settings.digestHour ?? 8))
  const [digestSecondHour, setDigestSecondHour] = useState<string>(String(settings.digestSecondHour ?? 17))
  const [digestDays, setDigestDays] = useState(settings.digestDays ?? 'every_day')
  const [digestTimezoneOffset, setDigestTimezoneOffset] = useState<string>(String(settings.digestTimezoneOffset ?? 0))
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(settings.businessHoursEnabled)
  const [businessHoursStart, setBusinessHoursStart] = useState<string>(String(settings.businessHoursStart))
  const [businessHoursEnd, setBusinessHoursEnd] = useState<string>(String(settings.businessHoursEnd))
  const [businessHoursDays, setBusinessHoursDays] = useState<string[]>(settings.businessHoursDays)
  const [businessHoursTimezoneOffset, setBusinessHoursTimezoneOffset] = useState<string>(String(settings.businessHoursTimezoneOffset))
  const [autoAckMessage, setAutoAckMessage] = useState(settings.autoAckMessage)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const parsedMax = maxRefundAmount.trim() === "" ? null : Number(maxRefundAmount)
    const parsedIter = Number(maxIterations)
    const parsedStart = Math.min(23, Math.max(0, businessHoursStart.trim() === '' ? 9 : parseInt(businessHoursStart, 10)))
    const parsedEnd = Math.min(23, Math.max(0, businessHoursEnd.trim() === '' ? 17 : parseInt(businessHoursEnd, 10)))
    if (businessHoursEnabled && parsedEnd <= parsedStart) {
      setError('Closing time must be later than opening time.')
      return
    }
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            agentName: agentName.trim() || "Clerk",
            aiContext,
            brandVoice,
            autoPlanOnOpen,
            alwaysDraftReply,
            defaultInstruction,
            requireApprovalForActions,
            toolsEnabled,
            maxRefundAmount: isNaN(parsedMax as number) ? null : parsedMax,
            blockCancellations,
            blockCustomLineItems,
            maxIterations: isNaN(parsedIter) || parsedIter < 1 ? 10 : parsedIter,
            replyLanguage,
            digestEnabled,
            digestFrequency,
            digestHour: Math.min(23, Math.max(0, digestHour.trim() === '' ? 8 : parseInt(digestHour, 10))),
            digestSecondHour: Math.min(23, Math.max(0, digestSecondHour.trim() === '' ? 17 : parseInt(digestSecondHour, 10))),
            digestDays,
            digestTimezoneOffset: Math.min(14, Math.max(-12, digestTimezoneOffset.trim() === '' ? 0 : parseInt(digestTimezoneOffset, 10))),
            businessHoursEnabled,
            businessHoursStart: parsedStart,
            businessHoursEnd: parsedEnd,
            businessHoursDays,
            businessHoursTimezoneOffset: Math.min(14, Math.max(-12, businessHoursTimezoneOffset.trim() === '' ? 0 : parseInt(businessHoursTimezoneOffset, 10))),
            autoAckMessage,
          },
        }),
      })
      if (!res.ok) throw new Error('Failed')
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
            <Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Clerk" className="h-9 text-sm bg-white" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Brand name
              <span className="ml-1.5 font-normal text-white/30">· used in AI draft prompts</span>
            </label>
            <Input value={aiContext} onChange={e => setAiContext(e.target.value)} placeholder="e.g. Acme Store" className="h-9 text-sm bg-white" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Brand voice
              <span className="ml-1.5 font-normal text-white/30">· max 200 characters</span>
            </label>
            <Textarea
              value={brandVoice}
              onChange={e => setBrandVoice(e.target.value)}
              placeholder="e.g. Friendly and direct. Never over-apologise. Use plain language."
              maxLength={200}
              rows={3}
            />
            <p className="text-[11px] text-white/30 text-right">{brandVoice.length}/200</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Default Behavior" description="What the agent does automatically when a ticket is opened.">
        <div className="space-y-5">
          <ToggleRow
            label="Auto-plan on ticket open"
            description="Automatically generate an action plan when you open a ticket with an unread customer message."
            checked={autoPlanOnOpen}
            onChange={setAutoPlanOnOpen}
          />
          <ToggleRow
            label="Always draft a customer reply"
            description="Include a draft reply in every plan, even when no actions are needed."
            checked={alwaysDraftReply}
            onChange={setAlwaysDraftReply}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Default instruction
              <span className="ml-1.5 font-normal text-white/30">· pre-filled in the plan prompt</span>
            </label>
            <Input
              value={defaultInstruction}
              onChange={e => setDefaultInstruction(e.target.value)}
              placeholder="e.g. Resolve the customer's issue and draft a reply"
              className="h-9 text-sm bg-white"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Approval Workflow" description="Control when a human must approve before the agent acts.">
        <ToggleRow
          label="Require approval before executing actions"
          description="Show a plan card and wait for your confirmation before the agent runs any Shopify or communication actions."
          checked={requireApprovalForActions}
          onChange={setRequireApprovalForActions}
        />
      </SectionCard>

      <SectionCard title="Tool Permissions" description="Choose which categories of tools the agent is allowed to use.">
        <div className="space-y-4">
          <ToggleRow
            label="Actions"
            description="Shopify write operations: issue refunds, cancel orders, update shipping addresses, add Shopify notes."
            checked={toolsEnabled.action}
            onChange={v => setToolsEnabled(p => ({ ...p, action: v }))}
            badge="High impact"
            badgeColor="text-orange-600 bg-orange-50 border-orange-200"
          />
          <ToggleRow
            label="Communication"
            description="Send replies to customers on their channel (email, Instagram DM, etc.)."
            checked={toolsEnabled.communication}
            onChange={v => setToolsEnabled(p => ({ ...p, communication: v }))}
            badge="Customer-facing"
            badgeColor="text-blue-600 bg-blue-50 border-blue-200"
          />
          <ToggleRow
            label="Internal"
            description="Add internal notes, update ticket status, and update ticket tags."
            checked={toolsEnabled.internal}
            onChange={v => setToolsEnabled(p => ({ ...p, internal: v }))}
            badge="Internal"
            badgeColor="text-violet-600 bg-violet-50 border-violet-200"
          />
          <ToggleRow
            label="Read"
            description="Fetch Shopify customer profiles and order history. Read-only — no changes are made."
            checked={toolsEnabled.read}
            onChange={v => setToolsEnabled(p => ({ ...p, read: v }))}
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
                value={maxRefundAmount}
                onChange={e => setMaxRefundAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 50"
                className="h-9 text-sm bg-white pl-7"
              />
            </div>
            <p className="text-[11px] text-white/30">Refunds above this amount will require manual approval.</p>
          </div>
          <ToggleRow
            label="Block order cancellations"
            description="Prevent the agent from cancelling orders entirely. Cancellations will require manual handling."
            checked={blockCancellations}
            onChange={setBlockCancellations}
          />
          <ToggleRow
            label="Block custom line items"
            description="Require a Shopify variant ID on all new orders. Prevents the agent from creating orders with ad-hoc line items."
            checked={blockCustomLineItems}
            onChange={setBlockCustomLineItems}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60">
              Max iterations
              <span className="ml-1.5 font-normal text-white/30">· default 10</span>
            </label>
            <div className="w-32">
              <Input
                value={maxIterations}
                onChange={e => setMaxIterations(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="10"
                className="h-9 text-sm bg-white"
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
            value={replyLanguage}
            onChange={e => setReplyLanguage(e.target.value)}
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
            checked={digestEnabled}
            onChange={setDigestEnabled}
          />

          {digestEnabled && (
            <>
              {/* Frequency */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Frequency</label>
                <select
                  value={digestFrequency}
                  onChange={e => setDigestFrequency(e.target.value as OrgSettings['digestFrequency'])}
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

              {/* Send times */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-white/60">
                    {digestFrequency === 'twice_daily' ? 'First send time' : 'Send time'}
                    <span className="ml-1.5 font-normal text-white/30">
                      {digestFrequency.startsWith('every_') ? '· starting hour — repeats from here' : '· local hour (0–23)'}
                    </span>
                  </label>
                  <div className="w-32">
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={digestHour}
                      onChange={e => setDigestHour(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="8"
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                </div>

                {digestFrequency === 'twice_daily' && (
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
                        value={digestSecondHour}
                        onChange={e => setDigestSecondHour(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="17"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Days */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Days</label>
                <div className="flex gap-2">
                  {([['every_day', 'Every day'], ['weekdays', 'Weekdays only']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDigestDays(val)}
                      className={`h-8 px-3 rounded-md border text-xs font-semibold transition-all ${
                        digestDays === val
                          ? 'bg-white/[0.15] text-white border-white/[0.35]'
                          : 'bg-transparent border-white/[0.12] text-white/40 hover:border-white/[0.22] hover:text-white/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Timezone</label>
                <select
                  value={digestTimezoneOffset}
                  onChange={e => setDigestTimezoneOffset(e.target.value)}
                  className="h-9 w-64 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                >
                  {TIMEZONE_OPTIONS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
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
            checked={businessHoursEnabled}
            onChange={setBusinessHoursEnabled}
          />

          {businessHoursEnabled && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Days open</label>
                <div className="flex gap-1.5 flex-wrap">
                  {([['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessHoursDays(prev =>
                        prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]
                      )}
                      className={`h-8 w-12 rounded-md border text-xs font-semibold transition-all ${
                        businessHoursDays.includes(val)
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
                      value={businessHoursStart}
                      onChange={e => setBusinessHoursStart(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="9"
                      className="h-9 text-sm bg-white"
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
                      value={businessHoursEnd}
                      onChange={e => setBusinessHoursEnd(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="17"
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">Timezone</label>
                <select
                  value={businessHoursTimezoneOffset}
                  onChange={e => setBusinessHoursTimezoneOffset(e.target.value)}
                  className="h-9 w-64 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                >
                  {TIMEZONE_OPTIONS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white/60">
                  Auto-acknowledgment message
                  <span className="ml-1.5 font-normal text-white/30">· max 500 characters</span>
                </label>
                <Textarea
                  value={autoAckMessage}
                  onChange={e => setAutoAckMessage(e.target.value)}
                  placeholder="Thanks for reaching out! We're currently outside business hours and will get back to you soon."
                  maxLength={500}
                  rows={3}
                />
                <p className="text-[11px] text-white/30 text-right">{autoAckMessage.length}/500</p>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <div className="flex items-center justify-end gap-3 pt-1">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  )
}
