"use client"

import { Loader2, Search, X } from "lucide-react"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import {
  searchFilterControlClassName,
  searchFilterSurfaceClassName,
} from "./search-filter-bar-styles"

export { searchFilterControlClassName, searchFilterSurfaceClassName }

export interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean
}

export function FilterPill({
  pressed = false,
  className,
  type = "button",
  role,
  children,
  ...props
}: FilterPillProps) {
  const isTab = role === "tab"

  return (
    <button
      type={type}
      role={role}
      aria-pressed={isTab ? undefined : pressed}
      aria-selected={isTab ? pressed : undefined}
      className={cn(
        searchFilterControlClassName,
        "shrink-0 px-4 text-xs font-semibold transition-colors",
        pressed
          ? "bg-foreground text-background"
          : "text-strong hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string
  onValueChange: (value: string) => void
  loading?: boolean
  onClear?: () => void
}

export function SearchField({
  value,
  onValueChange,
  loading = false,
  onClear,
  className,
  placeholder,
  ...props
}: SearchFieldProps) {
  const showClear = Boolean(onClear && value)
  const hasAccessory = loading || showClear

  return (
    <div className="relative min-w-[12rem] flex-1">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={event => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          searchFilterControlClassName,
          "w-full pl-10 text-sm text-strong outline-none transition-shadow placeholder:text-faint focus:shadow-[0_1px_2px_rgba(43,33,24,0.06),0_8px_22px_rgba(43,33,24,0.12)] [&::-webkit-search-cancel-button]:appearance-none",
          hasAccessory ? "pr-10" : "pr-4",
          className,
        )}
        {...props}
      />
      {loading ? (
        <Loader2
          aria-hidden
          className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint"
        />
      ) : showClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-muted-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export interface SearchFilterItem {
  id: string
  label: ReactNode
  pressed?: boolean
  onClick: () => void
  testId?: string
  role?: "tab"
}

export interface SearchFilterBarProps {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  "aria-label": string
  loading?: boolean
  onClear?: () => void
  filters?: readonly SearchFilterItem[]
  filterGroup?: {
    role?: "group" | "tablist"
    "aria-label"?: string
  }
  trailing?: ReactNode
  className?: string
}

export function SearchFilterBar({
  value,
  onValueChange,
  placeholder,
  "aria-label": ariaLabel,
  loading,
  onClear,
  filters,
  filterGroup,
  trailing,
  className,
}: SearchFilterBarProps) {
  const pills = filters?.length ? (
    <div
      role={filterGroup?.role}
      aria-label={filterGroup?.["aria-label"]}
      className="flex shrink-0 items-center gap-2.5"
    >
      {filters.map(filter => (
        <FilterPill
          key={filter.id}
          pressed={filter.pressed}
          onClick={filter.onClick}
          role={filter.role ?? (filterGroup?.role === "tablist" ? "tab" : undefined)}
          data-testid={filter.testId}
        >
          {filter.label}
        </FilterPill>
      ))}
    </div>
  ) : null

  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <SearchField
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        loading={loading}
        onClear={onClear}
      />
      {pills}
      {trailing}
    </div>
  )
}

export function SearchFilterBarSkeleton({
  pills = 0,
  trailing = false,
  className,
}: {
  pills?: number
  trailing?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} aria-hidden>
      <div className={cn(searchFilterControlClassName, "min-w-0 flex-1 animate-pulse bg-white/80")} />
      {Array.from({ length: pills }, (_, index) => (
        <div
          key={`search-filter-pill-${index}`}
          className={cn(searchFilterControlClassName, "w-20 animate-pulse bg-white/80")}
        />
      ))}
      {trailing ? (
        <div className="h-10 w-24 shrink-0 animate-pulse rounded-full bg-foreground/80" />
      ) : null}
    </div>
  )
}
