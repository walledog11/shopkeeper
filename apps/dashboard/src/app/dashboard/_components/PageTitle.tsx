import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"

/**
 * A dashboard page's name, in one style everywhere. A phone's top bar already
 * names a top-level page, so there the title is for screen readers only; a
 * settings section is not in the top bar and shows at every width.
 */
export function PageTitle({
  children,
  showOnPhone = false,
}: {
  children: ReactNode
  showOnPhone?: boolean
}) {
  return (
    <h1 className={cn("text-lg font-semibold tracking-tight text-strong", !showOnPhone && "max-md:sr-only")}>
      {children}
    </h1>
  )
}
