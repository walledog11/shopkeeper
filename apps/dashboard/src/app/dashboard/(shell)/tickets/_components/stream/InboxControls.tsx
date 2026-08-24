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
      filterGroup={{
        role: "tablist",
        "aria-label": "Conversation status",
        testId: "inbox-toggle-closed",
      }}
      filters={[
        {
          id: "open",
          label: "Open",
          pressed: !includeClosed,
          onClick: () => {
            if (includeClosed) onToggleClosed()
          },
        },
        {
          id: "all",
          label: "All",
          pressed: includeClosed,
          onClick: () => {
            if (!includeClosed) onToggleClosed()
          },
        },
      ]}
    />
  )
}
