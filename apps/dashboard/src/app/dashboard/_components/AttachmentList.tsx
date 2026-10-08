"use client"

import Image from "next/image"
import { isImageAttachmentUrl } from "@/lib/attachments/blob-ref"
import { cn } from "@/lib/ui/cn"

// Display URLs (`toAttachmentDisplayUrl`), not stored refs. Shared by the ticket
// timeline and the approval cards, which show a damage claim's photos as one
// `compact` row of thumbnails so the card's approve controls stay on screen.
export function AttachmentList({ attachments, compact = false }: { attachments: string[]; compact?: boolean }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className={cn("flex gap-2 mt-2", compact ? "overflow-x-auto" : "flex-wrap")}>
      {attachments.map((url) => (
        isImageAttachmentUrl(url)
          ? (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Open full size" className="shrink-0">
                <Image
                  src={url}
                  alt="attachment"
                  width={240}
                  height={160}
                  unoptimized
                  className={cn(
                    "rounded-md border border-foreground/[0.10]",
                    compact ? "h-28 w-auto object-cover" : "h-auto max-w-[240px]",
                  )}
                />
              </a>
            )
          : <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Download attachment</a>
      ))}
    </div>
  )
}
