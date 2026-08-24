"use client"

import { ChevronDown, Loader2, Search, X } from "lucide-react"
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react"
import { cn } from "@/lib/ui/cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  searchFilterControlClassName,
  searchFilterMenuItemActiveClassName,
  searchFilterMenuItemClassName,
  searchFilterMenuPanelClassName,
  searchFilterSurfaceClassName,
} from "./search-filter-bar-styles"

interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean
}

const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  function FilterPill(
    {
      pressed,
      className,
      type = "button",
      role,
      children,
      ...props
    },
    ref,
  ) {
    const isTab = role === "tab"

    return (
      <button
        ref={ref}
        type={type}
        role={role}
        aria-pressed={isTab || pressed === undefined ? undefined : pressed}
        aria-selected={isTab ? pressed : undefined}
        className={cn(
          searchFilterControlClassName,
          "shrink-0 gap-1.5 px-4 text-sm font-semibold text-sidebar-foreground outline-none",
          className,
        )}
        {...props}
      >
        <span className="truncate whitespace-nowrap">{children}</span>
        <ChevronDown className="size-4 shrink-0 text-sidebar-foreground/40" />
      </button>
    )
  },
)

export interface FilterMenuItem {
  id: string
  label: ReactNode
  selected?: boolean
  onSelect: () => void
  testId?: string
}

export function FilterMenu({
  label,
  items,
  "aria-label": ariaLabel,
  testId,
}: {
  label: ReactNode
  items: readonly FilterMenuItem[]
  "aria-label"?: string
  testId?: string
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <FilterPill aria-label={ariaLabel} data-testid={testId}>
          {label}
        </FilterPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className={searchFilterMenuPanelClassName}
      >
        {items.map(item => (
          <DropdownMenuItem
            key={item.id}
            onClick={item.onSelect}
            data-testid={item.testId}
            className={cn(
              searchFilterMenuItemClassName,
              item.selected && searchFilterMenuItemActiveClassName,
            )}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string
  onValueChange: (value: string) => void
  loading?: boolean
  onClear?: () => void
}

function SearchField({
  value,
  onValueChange,
  loading = false,
  onClear,
  className,
  placeholder,
  ...props
}: SearchFieldProps) {
  const showClear = Boolean(onClear && value)

  return (
    <div className={cn(searchFilterControlClassName, "min-w-[12rem] flex-1 gap-2 px-4", className)}>
      <Search
        className="size-4 shrink-0 text-sidebar-foreground/50"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={event => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent py-0 text-sm leading-5 text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45 [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {loading ? (
        <Loader2
          aria-hidden
          className="size-4 shrink-0 animate-spin text-sidebar-foreground/45"
        />
      ) : showClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="shrink-0 text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

interface SearchFilterItem {
  id: string
  label: ReactNode
  pressed?: boolean
  onClick: () => void
  testId?: string
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
    testId?: string
  }
  trailing?: ReactNode
  className?: string
}

function toFilterMenu(
  filters: readonly SearchFilterItem[],
  filterGroup?: SearchFilterBarProps["filterGroup"],
) {
  const selected = filters.find(filter => filter.pressed) ?? filters[0]
  return (
    <FilterMenu
      label={selected.label}
      aria-label={filterGroup?.["aria-label"]}
      testId={filterGroup?.testId ?? filters.find(filter => filter.testId)?.testId}
      items={filters.map(filter => ({
        id: filter.id,
        label: filter.label,
        selected: Boolean(filter.pressed),
        onSelect: filter.onClick,
      }))}
    />
  )
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
  const pills = filters?.length ? toFilterMenu(filters, filterGroup) : null

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
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
    <div className={cn("flex items-center gap-3", className)} aria-hidden>
      <div className={cn(searchFilterControlClassName, "min-w-0 flex-1 animate-pulse")} />
      {pills > 0 ? (
        <div className={cn(searchFilterControlClassName, "w-24 animate-pulse")} />
      ) : null}
      {trailing ? (
        <div className="h-12 w-24 shrink-0 animate-pulse rounded-xl bg-foreground/80" />
      ) : null}
    </div>
  )
}
