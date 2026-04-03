"use client"

import { useState } from "react"
import Image from "next/image"
import useSWR from "swr"
import { Check, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"

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
    <div className={cn(
      "flex flex-col rounded-md border bg-white transition-all duration-200",
      isConnected
        ? "border-green-200 shadow-sm ring-1 ring-green-100/80"
        : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
    )}>
      {/* Header */}
      <div className="flex items-center gap-4 p-4 pb-3">
        <div className={cn(
          "h-11 w-11 rounded-md flex items-center justify-center p-2 shrink-0 border transition-colors",
          isConnected ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
        )}>
          <Image src="/logos/sms.svg" alt="SMS" width={28} height={28} className="object-contain" unoptimized />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-none mb-1.5">SMS / WhatsApp</p>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full shrink-0", isConnected ? "bg-green-500" : "bg-slate-300")} />
            <span className={cn("text-[11px] font-semibold", isConnected ? "text-green-700" : "text-slate-500")}>
              {isConnected ? "Enabled" : "Not enabled"}
            </span>
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="px-4 pb-3 text-sm text-slate-500 leading-relaxed">
        Let your team interact with the AI agent via text or WhatsApp. Text an order number and the agent handles refunds, cancellations, and more.
      </p>

      {orgError && <p className="mx-4 mb-3 text-xs text-red-500">{orgError}</p>}

      {/* Enabled state: org number + personal phone */}
      {isConnected && twilioStatus?.phoneNumber && (
        <div className="mx-4 mb-4 rounded-md border border-slate-100 overflow-hidden divide-y divide-slate-100">

          {/* Org number row */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/70">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Org number</p>
              <p className="text-xs font-mono font-medium text-slate-700">{twilioStatus.phoneNumber}</p>
            </div>
            <button
              onClick={disableSms}
              disabled={disabling}
              className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors shrink-0"
            >
              {disabling ? 'Disabling…' : 'Disable'}
            </button>
          </div>

          {/* Personal phone row */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Your phone</p>

            {isVerified ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="text-xs font-mono font-medium text-slate-700">{phoneStatus?.phoneNumber}</span>
                </div>
                <button
                  onClick={removePhone}
                  className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : codeSent ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Code sent to <span className="font-mono font-semibold text-slate-700">{phoneInput}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    className="h-8 text-sm font-mono bg-white w-28"
                  />
                  <Button
                    size="sm"
                    onClick={verifyCode}
                    disabled={code.length !== 6 || verifying}
                    className="h-8 bg-slate-900 text-white hover:bg-slate-700 font-semibold text-xs"
                  >
                    {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
                  </Button>
                  <button
                    onClick={() => { setCodeSent(false); setCode('') }}
                    className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    Back
                  </button>
                </div>
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Register your number to start texting the agent.</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="tel"
                    placeholder="+15551234567"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    className="h-8 text-sm bg-white"
                  />
                  <Button
                    size="sm"
                    onClick={sendCode}
                    disabled={!phoneInput || sendingCode}
                    className="h-8 bg-slate-900 text-white hover:bg-slate-700 font-semibold text-xs shrink-0"
                  >
                    {sendingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send code'}
                  </Button>
                </div>
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer: Enable button when not connected */}
      {!isConnected && (
        <div className="mt-auto px-4 py-3 border-t border-slate-100 space-y-2">
          <Input
            type="tel"
            placeholder="+15551234567 (existing Twilio number, optional)"
            value={twilioNumber}
            onChange={e => setTwilioNumber(e.target.value)}
            className="h-8 text-sm bg-white"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={provisioning}
              onClick={enableSms}
              className="font-semibold h-8 text-xs bg-slate-900 hover:bg-slate-700 text-white border-0 gap-1.5"
            >
              {provisioning
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />Provisioning…</>
                : <><span>Enable SMS</span><ChevronRight className="w-3.5 h-3.5" /></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
