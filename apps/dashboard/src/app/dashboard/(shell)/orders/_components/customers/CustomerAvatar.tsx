import { initials, type CustomerRow } from "./customers-page-utils"

export function CustomerAvatar({ customer, size = "md" }: { customer: CustomerRow; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "size-12 text-sm" : size === "sm" ? "size-7 text-xs" : "size-9 text-xs"
  return (
    <div className={`${cls} rounded-full bg-foreground/[0.06] border border-border flex items-center justify-center font-bold text-muted-foreground shrink-0`}>
      {initials(customer)}
    </div>
  )
}
