import {
  NeedsYouCardBody,
  NeedsYouCardHeader,
  NeedsYouCardShell,
} from "@/app/dashboard/_components/home/needs-you-card-ui"

const CARD_KEYS = [
  "inbox-skeleton-1",
  "inbox-skeleton-2",
  "inbox-skeleton-3",
]

export function InboxStreamLoading() {
  return (
    <div aria-busy="true" aria-label="Loading conversations" className="flex flex-col gap-3">
      {CARD_KEYS.map(key => (
        <NeedsYouCardShell key={key}>
          <NeedsYouCardHeader>
            <div className="flex animate-pulse items-center gap-2">
              <div className="size-9 shrink-0 rounded-2xl bg-foreground/[0.06] sm:size-10" />
              <div className="h-9 min-w-0 flex-1 rounded-2xl bg-foreground/[0.06] sm:h-10" />
              <div className="h-9 w-16 shrink-0 rounded-2xl bg-foreground/[0.05] sm:h-10" />
              <div className="h-9 w-14 shrink-0 rounded-2xl bg-foreground/[0.05] sm:h-10" />
            </div>
          </NeedsYouCardHeader>
          <NeedsYouCardBody className="gap-2 py-2.5">
            <div className="h-4 w-2/5 rounded bg-foreground/[0.06]" />
            <div className="h-3 w-4/5 rounded bg-foreground/[0.05]" />
          </NeedsYouCardBody>
        </NeedsYouCardShell>
      ))}
    </div>
  )
}
