import { initials, type CustomerRow } from "./customers-page-utils"

export function CustomerAvatar({ customer, size = "md" }: { customer: CustomerRow; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "size-12 text-sm" : size === "sm" ? "size-7 text-xs" : "size-9 text-xs"
  return (
    <div className={`${cls} rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center font-bold text-white/60 shrink-0`}>
      {initials(customer)}
    </div>
  )
}
