import { Users } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export function CustomersEmptyState({ isSearch, query }: { isSearch: boolean; query: string }) {
  return (
    <EmptyState
      className="py-20"
      icon={<Users className="size-5 text-foreground/40" />}
      title={isSearch ? `No customers match "${query}"` : "No customers found"}
      description={isSearch ? "Try a different name or email address." : undefined}
    />
  )
}
