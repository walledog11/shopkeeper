"use client"

import { useState } from "react"
import { Download, Loader2, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { triggerDownload } from "./reports-helpers"

export function GdprExportSection() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleExport() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setStatus("loading")
    setErrorMsg("")
    try {
      const res = await fetch(`/api/reports/gdpr?email=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg((body as { error?: string }).error ?? "Export failed. Check the email address and try again.")
        setStatus("error")
        return
      }
      // Server sends Content-Disposition: attachment, browser uses that filename.
      triggerDownload(await res.blob(), `customer-data-${trimmed.replace(/[^a-z0-9]/g, "-")}.json`)
      setStatus("idle")
    } catch {
      setErrorMsg("Something went wrong. Please try again.")
      setStatus("error")
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-muted flex items-center justify-center">
            <Shield className="size-3.5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-sm">Customer Data Export</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">GDPR / CCPA , export all data associated with a customer</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground mb-4">
          Enter the customer&apos;s email address to download all their support conversations and profile data as a JSON file.
          Use this to respond to data access requests under GDPR (Art. 15) or CCPA.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            aria-label="Customer email for data export"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setStatus("idle") }}
            onKeyDown={e => e.key === "Enter" && handleExport()}
            placeholder="customer@example.com"
            className="flex-1 min-w-48 bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <button type="button"
            onClick={handleExport}
            disabled={status === "loading" || !email.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading"
              ? <><Loader2 className="size-3.5 animate-spin" /> Exporting…</>
              : <><Download className="size-3.5" /> Export Data</>
            }
          </button>
        </div>
        {status === "error" && (
          <p className="text-xs text-red-400 mt-2">{errorMsg}</p>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Message data is retained for 90 days, then archived. Archived threads are purged after another 90 days.
        </p>
      </CardContent>
    </Card>
  )
}
