"use client"

import { useState } from "react"
import { ClipboardCopy } from "lucide-react"
import { ManageDropdown } from "../context-panel/ManageDropdown"

/** Copies the ticket's diagnostic timeline, to paste wherever a run is being investigated. */
export function TicketTimelineMenu({ threadId }: { threadId: string }) {
  const [status, setStatus] = useState<null | "copied" | "failed">(null)

  async function copyTimeline() {
    // Safari only lets a page write the clipboard inside the click, so the
    // write starts now with the text still on its way.
    const text = fetch(`/api/threads/${threadId}/timeline`, { cache: "no-store" }).then(async (res) => {
      if (!res.ok) throw new Error("timeline")
      return new Blob([await res.text()], { type: "text/plain" })
    })
    try {
      if (typeof ClipboardItem === "undefined") await navigator.clipboard.writeText(await (await text).text())
      else await navigator.clipboard.write([new ClipboardItem({ "text/plain": text })])
      setStatus("copied")
    } catch {
      setStatus("failed")
    }
    setTimeout(() => setStatus(null), 2500)
  }

  return (
    <div className="flex items-center gap-1.5">
      {status ? (
        <span role="status" className="text-xs text-muted-foreground">
          {status === "copied" ? "Timeline copied" : "Couldn't copy"}
        </span>
      ) : null}
      <ManageDropdown
        label="More ticket actions"
        items={[{ label: "Copy timeline", icon: <ClipboardCopy className="size-3" />, onClick: copyTimeline }]}
      />
    </div>
  )
}
