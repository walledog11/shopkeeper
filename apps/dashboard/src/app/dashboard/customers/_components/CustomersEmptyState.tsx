import { Users } from "lucide-react"

export function CustomersEmptyState({ isSearch, query }: { isSearch: boolean; query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-10 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center mb-3">
        <Users className="size-4 text-white/30" />
      </div>
      <p className="text-sm font-semibold text-white/40 mb-1">
        {isSearch ? `No customers match "${query}"` : "No customers found"}
      </p>
      {isSearch && (
        <p className="text-xs text-white/25">Try a different name or email address.</p>
      )}
    </div>
  )
}
