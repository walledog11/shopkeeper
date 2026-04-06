"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SaveButton, ToggleRow, SectionCard } from "./shared"
import type { OrgSettings, AgentToolPermissions } from "@/types"

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
  const [maxIterations, setMaxIterations] = useState<string>(String(settings.maxIterations ?? 10))
  const [replyLanguage, setReplyLanguage] = useState(settings.replyLanguage ?? "auto")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const parsedMax = maxRefundAmount.trim() === "" ? null : Number(maxRefundAmount)
    const parsedIter = Number(maxIterations)
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
            maxIterations: isNaN(parsedIter) || parsedIter < 1 ? 10 : parsedIter,
            replyLanguage,
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

      <div className="flex items-center justify-end gap-3 pt-1">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  )
}
