"use client"

import { RefreshCw, UserPlus } from "lucide-react"

export interface CreateCustomerDraft {
  first_name: string
  last_name: string
  email: string
}

interface ShopifyCustomerCreateProps {
  draft: CreateCustomerDraft
  error: string | null
  isCreating: boolean
  onDraftChange: (draft: CreateCustomerDraft) => void
  onBack: () => void
  onCreate: () => void
}

export function ShopifyCustomerCreate({
  draft,
  error,
  isCreating,
  onDraftChange,
  onBack,
  onCreate,
}: ShopifyCustomerCreateProps) {
  const isDisabled = isCreating || (!draft.first_name && !draft.last_name && !draft.email)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground/30">New Shopify customer</p>
        <button type="button" onClick={onBack} className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors">Back</button>
      </div>
      <div className="space-y-1.5">
        {(['first_name', 'last_name', 'email'] as const).map(field => (
          <input
            key={field}
            type={field === 'email' ? 'email' : 'text'}
            placeholder={field === 'first_name' ? 'First name' : field === 'last_name' ? 'Last name' : 'Email'}
            aria-label={field === 'first_name' ? 'First name' : field === 'last_name' ? 'Last name' : 'Email'}
            value={draft[field]}
            onChange={e => onDraftChange({ ...draft, [field]: e.target.value })}
            className="w-full text-xs text-foreground/70 rounded-md border border-foreground/[0.12] bg-foreground/[0.06] px-2.5 py-1.5 focus:outline-none focus:border-foreground/[0.25] placeholder:text-foreground/20"
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={onCreate}
        disabled={isDisabled}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded-md py-1.5 transition-colors"
      >
        {isCreating ? <RefreshCw className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
        Create & link
      </button>
    </div>
  )
}
