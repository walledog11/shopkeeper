"use client"

import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExportButton } from "./ExportButton"
import { Skeleton } from "./Skeleton"
import { downloadCSV, type ReportsData } from "./reports-helpers"

export function CustomerContactCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReportsData
  isLoading: boolean
  rangeLabel: string
}) {
  const customers = data?.customers

  function handleExport() {
    if (!customers) return
    downloadCSV(`customer-contact-${rangeLabel.replace(/\s/g, "-")}.csv`, [
      ["Metric", "Count"],
      ["Unique customers", customers.unique],
      ["Repeat customers (3+ tickets)", customers.repeat],
      [],
      ["Name / ID", "Tickets"],
      ...customers.top.map(customer => [customer.name ?? customer.platformId, customer.count]),
    ])
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="size-3.5 text-blue-400" />
            </div>
            <CardTitle className="text-sm">Customer Contact</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !customers} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Unique Customers", value: customers?.unique, icon: <Users className="size-4 text-blue-400/70" /> },
            { label: "Repeat (3+ tickets)", value: customers?.repeat, icon: <Users className="size-4 text-amber-400/70" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                {icon}
              </div>
              {isLoading
                ? <Skeleton className="h-7 w-12" />
                : <p className="text-2xl font-extrabold text-foreground leading-none">{value?.toLocaleString() ?? "0"}</p>
              }
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Most active customers</p>
          {isLoading ? (
            <div className="space-y-2">
              {["customer-skeleton-1", "customer-skeleton-2", "customer-skeleton-3"].map((key) => <Skeleton key={key} className="h-10 w-full" />)}
            </div>
          ) : customers?.top.length ? (
            <div className="space-y-1.5">
              {customers.top.map(customer => (
                <div key={customer.platformId} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{customer.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">{customer.platformId}</p>
                  </div>
                  <span className="text-sm font-bold text-foreground shrink-0 ml-3">
                    {customer.count} {customer.count === 1 ? "ticket" : "tickets"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No customer data</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
