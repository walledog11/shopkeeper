"use client"

import { RefreshCw, UserPlus } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import {
  contextGhostButtonClassName,
  contextInputClassName,
  contextLabelClassName,
  contextPrimaryButtonClassName,
  contextTanPanelClassName,
} from "./context-panel-styles"

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
    <div className={cn(contextTanPanelClassName, "space-y-3")}>
      <div className="flex items-center justify-between gap-3">
        <p className={contextLabelClassName}>New customer</p>
        <button type="button" onClick={onBack} className={contextGhostButtonClassName}>
          Back
        </button>
      </div>
      <div className="space-y-2">
        {(["first_name", "last_name", "email"] as const).map(field => (
          <input
            key={field}
            type={field === "email" ? "email" : "text"}
            placeholder={field === "first_name" ? "First name" : field === "last_name" ? "Last name" : "Email"}
            aria-label={field === "first_name" ? "First name" : field === "last_name" ? "Last name" : "Email"}
            value={draft[field]}
            onChange={e => onDraftChange({ ...draft, [field]: e.target.value })}
            className={cn(contextInputClassName, "h-10")}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={onCreate}
        disabled={isDisabled}
        className={cn(contextPrimaryButtonClassName, "w-full")}
      >
        {isCreating ? <RefreshCw className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
        Create & link
      </button>
    </div>
  )
}
