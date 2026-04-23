"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetcher } from "@/lib/api/fetcher"
import { cn } from "@/lib/ui/cn"

interface TwilioStatus {
  connected: boolean
  phoneNumber?: string
}

interface PhoneStatus {
  phoneNumber: string | null
  phoneVerified: boolean
}

export default function SmsCard() {
  const { data: twilioStatus, mutate: mutateTwilio } = useSWR<TwilioStatus>('/api/integrations/twilio', fetcher)
  const { data: phoneStatus, mutate: mutatePhone } = useSWR<PhoneStatus>('/api/phone', fetcher)

  const [open, setOpen] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [twilioNumber, setTwilioNumber] = useState('')

  const [phoneInput, setPhoneInput] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  const isConnected = twilioStatus?.connected ?? false
  const isVerified = phoneStatus?.phoneVerified ?? false

  async function enableSms() {
    setProvisioning(true)
    setOrgError(null)
    try {
      const res = await fetch('/api/integrations/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(twilioNumber.trim() ? { phoneNumber: twilioNumber.trim() } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to enable SMS')
      await mutateTwilio()
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : 'Failed to enable SMS')
    } finally {
      setProvisioning(false)
    }
  }

  async function disableSms() {
    setDisabling(true)
    setOrgError(null)
    try {
      const res = await fetch('/api/integrations/twilio', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      await mutateTwilio()
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : 'Failed to disable SMS')
    } finally {
      setDisabling(false)
    }
  }

  async function sendCode() {
    setSendingCode(true)
    setPhoneError(null)
    try {
      const res = await fetch('/api/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setCodeSent(true)
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : 'Failed to send code')
    } finally {
      setSendingCode(false)
    }
  }

  async function verifyCode() {
    setVerifying(true)
    setPhoneError(null)
    try {
      const res = await fetch('/api/phone/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Incorrect code')
      await mutatePhone()
      setCodeSent(false)
      setPhoneInput('')
      setCode('')
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : 'Incorrect code')
    } finally {
      setVerifying(false)
    }
  }

  async function removePhone() {
    await fetch('/api/phone', { method: 'DELETE' })
    await mutatePhone()
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* ── Row header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06] border border-white/[0.08]">
          <Image src="/logos/sms.svg" alt="SMS" width={20} height={20} className="object-contain" unoptimized />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/85">SMS / WhatsApp</p>
          <p className="text-xs text-white/35 mt-0.5 truncate">
            Let your team interact with the AI agent via text or WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Enabled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/25">
              <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
              Not enabled
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-white/25 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-4">

          {orgError && <p className="text-xs text-red-400">{orgError}</p>}

          {/* Not connected: setup instructions + enable */}
          {!isConnected && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs text-white/40 leading-relaxed">
                  Text an order number to the agent and it handles refunds, cancellations, and lookups automatically.
                </p>
                <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Optionally enter an existing Twilio number, or Clerk will provision one</li>
                  <li>Click Enable SMS — your org gets a dedicated number</li>
                  <li>Register your personal phone number to start texting the agent</li>
                </ol>
              </div>
              <Input
                type="tel"
                placeholder="+15551234567 (existing Twilio number, optional)"
                value={twilioNumber}
                onChange={e => setTwilioNumber(e.target.value)}
                className="h-9 text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={provisioning}
                  onClick={enableSms}
                  className="h-9 px-4 font-medium"
                >
                  {provisioning
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Provisioning…</>
                    : 'Enable SMS'
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Connected: org number + personal phone */}
          {isConnected && twilioStatus?.phoneNumber && (
            <div className="rounded-md overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">

              {/* Org number */}
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-0.5">Org number</p>
                  <p className="text-xs font-mono font-medium text-white/60">{twilioStatus.phoneNumber}</p>
                </div>
                <button
                  onClick={disableSms}
                  disabled={disabling}
                  className="text-[11px] font-medium text-white/25 hover:text-red-400 transition-colors shrink-0"
                >
                  {disabling ? 'Disabling…' : 'Disable'}
                </button>
              </div>

              {/* Personal phone */}
              <div className="px-3.5 py-3">
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-2.5">Your phone</p>
                {isVerified ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs font-mono font-medium text-white/60">{phoneStatus?.phoneNumber}</span>
                    </div>
                    <button
                      onClick={removePhone}
                      className="text-[11px] font-medium text-white/25 hover:text-red-400 transition-colors shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ) : codeSent ? (
                  <div className="space-y-2">
                    <p className="text-xs text-white/40">
                      Code sent to <span className="font-mono font-semibold text-white/60">{phoneInput}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="123456"
                        maxLength={6}
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                        className="h-8 text-sm font-mono w-28"
                      />
                      <Button
                        size="sm"
                        onClick={verifyCode}
                        disabled={code.length !== 6 || verifying}
                        className="h-8 font-semibold text-xs"
                      >
                        {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
                      </Button>
                      <button
                        onClick={() => { setCodeSent(false); setCode('') }}
                        className="text-xs text-white/30 hover:text-white/70 transition-colors"
                      >
                        Back
                      </button>
                    </div>
                    {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-white/30">Register your number to start texting the agent.</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="tel"
                        placeholder="+15551234567"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={sendCode}
                        disabled={!phoneInput || sendingCode}
                        className="h-8 font-semibold text-xs shrink-0"
                      >
                        {sendingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send code'}
                      </Button>
                    </div>
                    {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  )
}
