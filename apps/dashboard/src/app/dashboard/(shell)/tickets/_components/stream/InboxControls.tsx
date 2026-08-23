"use client"

import { SearchFilterBar } from "@/components/ui/search-filter-bar"

export function InboxControls({
  searchQuery,
  isSearchLoading,
  includeClosed,
  onSearchChange,
  onToggleClosed,
}: {
  searchQuery: string
  isSearchLoading: boolean
  includeClosed: boolean
  onSearchChange: (value: string) => void
  onToggleClosed: () => void
}) {
  return (
    <SearchFilterBar
      value={searchQuery}
      onValueChange={onSearchChange}
      placeholder="Search conversations"
      aria-label="Search conversations"
      loading={isSearchLoading}
      onClear={() => onSearchChange("")}
      filters={[
        {
          id: "closed",
          label: "Closed",
          pressed: includeClosed,
          onClick: onToggleClosed,
          testId: "inbox-toggle-closed",
        },
      ]}
    />
  )
}
