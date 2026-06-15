import { Users } from "lucide-react"

export function CustomersEmptyState({ isSearch, query }: { isSearch: boolean; query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-10 rounded-md bg-foreground/[0.04] border border-border flex items-center justify-center mb-3">
        <Users className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground mb-1">
        {isSearch ? `No customers match "${query}"` : "No customers found"}
      </p>
      {isSearch && (
        <p className="text-xs text-muted-foreground/70">Try a different name or email address.</p>
      )}
    </div>
  )
}
