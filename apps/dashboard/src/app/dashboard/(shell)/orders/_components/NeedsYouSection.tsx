"use client"

import Link from "next/link"
import useSWR from "swr"
import { AlertTriangle, ExternalLink, Flag, Undo2 } from "lucide-react"
import { BoardColumnShell } from "@/app/dashboard/_components/board/BoardColumnShell"
import { requestJson } from "@/lib/api/fetcher"
import { formatRelativeTime } from "@/lib/format/date"
import type {
  OrderAttentionFinding,
  OrderAttentionResponse,
  OrderAttentionReturn,
} from "./order-requests"

const HEADER_CLASS = "mb-3 flex items-center justify-between gap-3 px-1"
const TITLE_CLASS = "truncate text-xs font-semibold uppercase tracking-normal text-strong"
const RETURNS_LOADING = <div className="h-[68px] animate-pulse rounded-2xl border border-border bg-card" />
const RETURNS_ERROR = (
  <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-4 py-3.5">
    <p className="text-sm font-semibold text-red-300">Couldn&apos;t load return requests.</p>
  </div>
)
const RETURNS_EMPTY = (
  <div className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/[0.10] bg-card/35 px-4 py-3.5">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-foreground/[0.10] bg-foreground/[0.04] text-faint">
      <Undo2 className="size-4" />
    </span>
    <p className="text-sm text-muted-foreground">No open return requests right now.</p>
  </div>
)

// Both attention sections read the same endpoint; SWR dedupes the request.
function useOrderAttention(enabled: boolean) {
  return useSWR<OrderAttentionResponse>(
    enabled ? "/api/orders/attention" : null,
    (url) => requestJson<OrderAttentionResponse>(url, { cache: "no-store" }),
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  )
}

function RowShell({
  href,
  external,
  tone,
  icon: Icon,
  title,
  detail,
  at,
}: {
  href: string
  external?: boolean
  tone: string
  icon: typeof Flag
  title: string
  detail: string | null
  at: string
}) {
  const inner = (
    <>
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-strong">{title}</h3>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-faint">
            {formatRelativeTime(at)}
            {external ? <ExternalLink className="size-3" /> : null}
          </span>
        </div>
        {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </>
  )

  const className =
    "flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-foreground/[0.16]"

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  )
}

function FindingRow({ finding, shop }: { finding: OrderAttentionFinding; shop: string | null }) {
  const adminHref = shop && finding.orderId ? `https://${shop}/admin/orders/${finding.orderId}` : null
  return (
    <RowShell
      href={adminHref ?? "/dashboard/review"}
      external={Boolean(adminHref)}
      tone="border-amber-500/20 bg-amber-500/10 text-amber-300"
      icon={Flag}
      title={finding.orderName}
      detail={finding.reason}
      at={finding.at}
    />
  )
}

function ReturnRow({ entry }: { entry: OrderAttentionReturn }) {
  return (
    <RowShell
      href={`/dashboard/tickets?thread=${entry.threadId}`}
      tone="border-sky-500/20 bg-sky-500/10 text-sky-300"
      icon={Undo2}
      title={entry.customerName}
      detail={entry.summary ?? "Return request"}
      at={entry.at}
    />
  )
}

// Order-ops risk findings. Gated until that module ships for the org, so this
// stays hidden until the agent actually flags an order — no dead section.
export default function NeedsYouSection({ enabled, shop }: { enabled: boolean; shop: string | null }) {
  const { data } = useOrderAttention(enabled)
  const findings = data?.findings ?? []
  if (findings.length === 0) return null

  return (
    <BoardColumnShell
      label="Needs you"
      icon={AlertTriangle}
      count={findings.length}
      expanded={false}
      canExpand={false}
      onExpandedChange={() => {}}
      isLoading={false}
      error={undefined}
      loading={null}
      errorContent={null}
      empty={null}
      headerClassName={HEADER_CLASS}
      titleClassName={TITLE_CLASS}
    >
      <div className="space-y-2.5">
        {findings.map((finding) => (
          <FindingRow key={finding.id} finding={finding} shop={shop} />
        ))}
      </div>
    </BoardColumnShell>
  )
}

// Real return requests = open support threads tagged "Returns" (a return is a
// customer conversation, not a refunded order). Links to the ticket.
export function ReturnRequestsSection() {
  const { data, isLoading, error } = useOrderAttention(true)
  const returns = data?.returns ?? []

  return (
    <BoardColumnShell
      label="Return Requests"
      icon={Undo2}
      count={returns.length}
      expanded={false}
      canExpand={false}
      onExpandedChange={() => {}}
      isLoading={isLoading}
      error={error}
      loading={RETURNS_LOADING}
      errorContent={RETURNS_ERROR}
      empty={RETURNS_EMPTY}
      headerClassName={HEADER_CLASS}
      titleClassName={TITLE_CLASS}
    >
      <div className="space-y-2.5">
        {returns.map((entry) => (
          <ReturnRow key={entry.threadId} entry={entry} />
        ))}
      </div>
    </BoardColumnShell>
  )
}
